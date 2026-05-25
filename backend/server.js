const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════════════
// OVERPASS PROXY
// ════════════════════════════════════════════════════════════════
app.post('/api/overpass', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    // Rate limiting: 1 request per second per IP
    const ip = req.ip;
    const now = Date.now();
    if (!global.rateLimitMap) global.rateLimitMap = {};
    
    const lastRequest = global.rateLimitMap[ip] || 0;
    if (now - lastRequest < 1000) {
      return res.status(429).json({ error: 'Rate limited: max 1 request/second' });
    }
    global.rateLimitMap[ip] = now;

    // Forward to Overpass API
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'TartuWalk/1.0 (+https://github.com/yourusername/TartuWalk)',
      },
      body: 'data=' + encodeURIComponent(query),
      timeout: 120000, // 2 min timeout
    });

    // Handle non-200 responses
    if (!response.ok) {
      console.error(`Overpass API error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({
        error: `Overpass API error: ${response.status}`,
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Overpass proxy error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
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
