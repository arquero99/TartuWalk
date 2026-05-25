# 🚀 TartuWalk Backend

Backend proxy para TartuWalk que resuelve el problema CORS. Maneja peticiones a las APIs de Overpass (OSM) y Nominatim (geocoding).

## 📋 Requisitos

- **Node.js** >= 16.0
- **npm** (incluido con Node.js)

## 🏃 Inicio Rápido (Desarrollo Local)

### 1. Instalar dependencias
```bash
cd backend
npm install
```

### 2. Iniciar servidor
```bash
npm start
```

El servidor estará disponible en `http://localhost:3001`

### 3. Health check
```bash
curl http://localhost:3001/health
```

---

## 📦 Despliegue en Producción

### Opción 1: Vercel (Recomendado - Gratis + Fácil)

1. **Instala Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Despliega:**
   ```bash
   cd backend
   vercel
   ```

3. **Actualiza HTML:**
   - Reemplaza `localhost:3001` con la URL de Vercel que te proporciona (ej: `https://tartu-walk-backend.vercel.app`)

**Ventajas:** Gratis, sin servidor que mantener, escalable automáticamente

---

### Opción 2: Heroku (Gratis - Requiere verificación)

1. **Instala Heroku CLI:**
   ```bash
   npm install -g heroku
   ```

2. **Crear app:**
   ```bash
   cd backend
   heroku login
   heroku create tartu-walk-backend
   ```

3. **Procfile:**
   - El archivo `Procfile` ya está configurado

4. **Deploy:**
   ```bash
   git push heroku main
   ```

5. **URL:** `https://tartu-walk-backend.herokuapp.com`

**Nota:** Heroku requiere tarjeta de crédito después del 28 de noviembre de 2022

---

### Opción 3: Railway.app (Gratis + Fácil)

1. Abre https://railway.app
2. Conecta tu repositorio de GitHub
3. Railway detectará automáticamente Node.js
4. El deploy es automático en cada push
5. Obtendrás una URL pública

---

### Opción 4: Servidor Propio (VPS/Dedicado)

**Con PM2 (proceso manager para Node):**

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar aplicación
pm2 start server.js --name "tartu-walk"

# Guardar para que reinicie en reboots
pm2 startup
pm2 save

# Ver logs
pm2 logs tartu-walk
```

**Con Nginx (reverse proxy):**

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔧 Configuración HTML

### En desarrollo local:
El HTML detecta automáticamente `localhost:3001` y usa esa URL.

### En producción:
El HTML usa `window.location.origin` (mismo dominio).

**Ejemplos:**
- HTML en `https://example.com/index.html` → Llama a `https://example.com/api/*`
- Backend en `https://api.example.com` → Edita manualmente `CONFIG.BACKEND_URL`

---

## 📊 Endpoints

### `POST /api/overpass`
Proxy para consultas Overpass QL

**Body:**
```json
{
  "query": "[out:json][timeout:30];..."
}
```

**Response:** Datos JSON de Overpass

---

### `GET /api/geocode?q=Toome,Tartu&limit=1`
Proxy para geocoding (Nominatim)

**Parameters:**
- `q` (string) - Búsqueda
- `limit` (number, default: 1)

**Response:** Array JSON de resultados

---

### `GET /health`
Health check

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-05-25T10:30:00.000Z"
}
```

---

## ⚙️ Rate Limiting

- **Overpass:** 1 solicitud/segundo por IP
- **Nominatim:** Sin límite (respetar T&C de OSM)

Si sobrellamas, verás:
```json
{
  "error": "Rate limited: max 1 request/second"
}
```

---

## 🐛 Troubleshooting

### Backend responde pero HTML falla
- Verifica CORS: Backend tiene `cors()` habilitado
- Revisa console del navegador (F12 → Console)

### "Cannot GET /api/overpass"
- Asegúrate de usar `POST` (no GET)
- Revisa que el JSON es válido

### Timeout
- Overpass API puede ser lenta
- El backend espera hasta 2 minutos (`timeout: 120000`)

---

## 📝 Notas

- El backend NO cachea datos (delega a los headers de Overpass)
- De momento solo proxy directo (sin autenticación)
- En producción, considera añadir autenticación o API keys

---

## 📄 Licencia

MIT
