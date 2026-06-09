require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');

// Use venv Python if available, otherwise fall back to system python3
const VENV_PYTHON = path.join(__dirname, 'venv', 'bin', 'python3');
const PYTHON_BIN  = process.env.PYTHON_BIN ||
                    (fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve the frontend from the repo root
app.use(express.static(path.join(__dirname, '..'), {index: 'tartu-walker.html' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const RETRYABLE = new Set([403, 429, 500, 502, 503, 504, 524]);

// ════════════════════════════════════════════════════════════════
// OVERPASS PROXY
// ════════════════════════════════════════════════════════════════
app.post('/api/overpass', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query parameter' });

    // Rate limiting: 1 request per second per IP
    const ip = req.ip;
    const now = Date.now();
    if (!global.rateLimitMap) global.rateLimitMap = {};
    if (now - (global.rateLimitMap[ip] || 0) < 1000) {
      return res.status(429).json({ error: 'Rate limited: max 1 request/second' });
    }
    global.rateLimitMap[ip] = now;

    // Try each endpoint; fall through on retryable errors or network failures
    let lastStatus = 504;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      let response;
      try {
        response = await fetch(endpoint, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':   'TartuWalk/1.0 (+https://github.com/yourusername/TartuWalk)',
          },
          body:    'data=' + encodeURIComponent(query),
          signal:  AbortSignal.timeout(120000),
        });
      } catch (e) {
        console.warn(`Overpass ${endpoint} unreachable: ${e.message}`);
        continue;
      }

      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      }

      lastStatus = response.status;
      console.warn(`Overpass ${endpoint} → ${response.status}`);
      if (!RETRYABLE.has(response.status)) {
        return res.status(response.status).json({ error: `Overpass error: ${response.status}` });
      }
    }

    res.status(lastStatus).json({ error: `All Overpass endpoints failed (${lastStatus})` });

  } catch (error) {
    console.error('Overpass proxy error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════
// NOMINATIM PROXY
// ════════════════════════════════════════════════════════════════
app.get('/api/geocode', async (req, res) => {
  try {
    const { q, limit = 1 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Missing q parameter' });
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', limit);
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'TartuWalk/1.0 (+https://github.com/yourusername/TartuWalk)',
        'Accept-Language': 'es,en;q=0.9',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Nominatim API error: ${response.status}`,
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Geocoding proxy error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// ════════════════════════════════════════════════════════════════
// NOMINATIM REVERSE GEOCODING PROXY
// ════════════════════════════════════════════════════════════════
app.get('/api/reverse', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon' });

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);
    url.searchParams.set('format', 'json');
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'TartuWalk/1.0 (+https://github.com/yourusername/TartuWalk)',
        'Accept-Language': 'es,en;q=0.9',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Nominatim error: ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Reverse geocoding proxy error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════
// POLLUTION  (CAMS via Python)
// ════════════════════════════════════════════════════════════════
let _pollCache   = null;   // session-level cache
let _pollPromise = null;   // in-flight request deduplication

function runCamsFetch() {
  if (_pollPromise) return _pollPromise;

  _pollPromise = new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'cams_fetch.py');
    const proc   = spawn(PYTHON_BIN, [script]);
    let out = '', err = '';

    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('CAMS timeout (5 min exceeded)'));
    }, 300_000);

    proc.on('close', code => {
      clearTimeout(timer);
      _pollPromise = null;
      if (code !== 0 && !out.trim()) return reject(new Error(err.slice(0, 400) || `exit ${code}`));
      try {
        const data = JSON.parse(out);
        if (data.error) return reject(new Error(data.error));
        _pollCache = data;
        resolve(data);
      } catch (e) {
        reject(new Error(`JSON parse: ${e.message} — stdout: ${out.slice(0, 200)}`));
      }
    });

    proc.on('error', e => { clearTimeout(timer); _pollPromise = null; reject(e); });
  });

  return _pollPromise;
}

app.get('/api/pollution', async (req, res) => {
  if (_pollCache) return res.json(_pollCache);
  try {
    const data = await runCamsFetch();
    res.json(data);
  } catch (e) {
    console.error('CAMS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TartuWalk Backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Overpass proxy: POST http://localhost:${PORT}/api/overpass`);
  console.log(`   Geocoding proxy: GET http://localhost:${PORT}/api/geocode`);
});
