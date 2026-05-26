# TartuWalk — Guía de Despliegue

## Arquitectura

```
TartuWalk/
├── tartu-walker.html   ← frontend (servido por el backend)
├── Addresses.txt       ← datos de prueba
├── documentation/
└── backend/
    ├── server.js       ← Express: sirve el frontend + proxies de API
    ├── cams_fetch.py   ← descarga datos de contaminación (CAMS/Copernicus)
    ├── requirements.txt
    └── package.json
```

El backend sirve el frontend directamente. Solo necesitas arrancar **un proceso**.

---

## Inicio Rápido (Desarrollo Local)

### Requisitos

- **Node.js** >= 16 ([nodejs.org](https://nodejs.org))
- **Python 3.8+** (para la capa de contaminación CAMS)

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd TartuWalk
```

### 2. Instalar dependencias Node

```bash
cd backend
npm install
```

### 3. Crear entorno virtual Python e instalar dependencias

```bash
# Desde la carpeta backend/
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
deactivate
```

> El servidor detecta automáticamente `backend/venv/bin/python3`. Si no existe el venv, usa el `python3` del sistema.

### 4. Arrancar

```bash
npm start
```

Abre el navegador en **http://localhost:3001**

---

## Credenciales de Copernicus CAMS (contaminación)

La capa de calidad del aire usa la API de Copernicus Atmosphere Data Store.
Las credenciales **nunca se guardan en el código** — se leen de un fichero `.env` local que git ignora.

### 1. Obtener la API key

1. Crea una cuenta en [ads.atmosphere.copernicus.eu](https://ads.atmosphere.copernicus.eu)
2. Ve a **My profile** (esquina superior derecha) → copia el valor del campo **API key**
3. Acepta los términos del dataset que usa la app:
   - Busca *CAMS European Air Quality Forecasts* → pestaña **Terms of use** → acepta

### 2. Crear el fichero `.env`

En la carpeta `backend/` hay un fichero `backend/.env.example` con la estructura. Copia ese fichero a `backend/.env` y rellena tu key:

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env`:
```
ADS_URL=https://ads.atmosphere.copernicus.eu/api
ADS_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   ← reemplaza con tu key real
```

> `backend/.env` está en `.gitignore` y nunca se sube al repositorio.
> `backend/.env.example` sí está en el repositorio como plantilla para otros colaboradores.

### 3. Verificar

Arranca el servidor (`npm start`) y abre `http://localhost:3001/api/pollution`.
La primera vez puede tardar 1-2 minutos mientras descarga los datos de CAMS.
Si la key no está configurada o es inválida, el endpoint devuelve un mensaje de error descriptivo.

Si no tienes cuenta CAMS, la app funciona igualmente pero sin la capa de contaminación.

---

## Despliegue en Producción

### Opción A: Servidor propio (VPS, Raspberry Pi, etc.)

1. **Clona y configura** igual que en desarrollo local.

2. **Arranca con PM2** para que el servidor sobreviva reinicios:

   ```bash
   npm install -g pm2
   cd backend
   pm2 start server.js --name tartu-walk
   pm2 startup   # genera el comando para que PM2 arranque al iniciar el sistema
   pm2 save
   ```

3. **(Opcional) Nginx como reverse proxy:**

   Nginx escucha en el puerto 80 (HTTP estándar) y reenvía las peticiones al servidor Node. Así la app es accesible en `http://tu-dominio.com` sin tener que poner `:3001` en la URL.

   **Instala Nginx** si no lo tienes:
   ```bash
   sudo apt install nginx          # Ubuntu/Debian
   sudo systemctl enable nginx
   ```

   **Crea el fichero de configuración** del sitio:
   ```bash
   sudo nano /etc/nginx/sites-available/tartu-walk
   ```

   Pega este contenido (cambia `tu-dominio.com` por tu dominio o IP):
   ```nginx
   server {
       listen 80;
       server_name tu-dominio.com;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

   **Activa el sitio y recarga Nginx:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/tartu-walk /etc/nginx/sites-enabled/
   sudo nginx -t          # verifica que la configuración no tiene errores
   sudo systemctl reload nginx
   ```

   La app estará disponible en `http://tu-dominio.com` (puerto 80).

   > **HTTPS con Let's Encrypt** (recomendado para producción):
   > ```bash
   > sudo apt install certbot python3-certbot-nginx
   > sudo certbot --nginx -d tu-dominio.com
   > ```
   > Certbot modifica la configuración de Nginx automáticamente y renueva el certificado solo.

4. **Variables de entorno:**

   Las variables de entorno disponibles son:

   | Variable     | Por defecto      | Descripción                          |
   |--------------|------------------|--------------------------------------|
   | `PORT`       | `3001`           | Puerto en el que escucha el servidor |
   | `PYTHON_BIN` | auto-detectado   | Ruta al ejecutable Python            |

   **Opción 1 — Solo para esa ejecución** (se pierde al cerrar el terminal):
   ```bash
   PORT=8080 npm start
   ```

   **Opción 2 — En la sesión actual del terminal** (se pierde al cerrar):
   ```bash
   export PORT=8080
   export PYTHON_BIN=/usr/bin/python3.11
   npm start
   ```

   **Opción 3 — Fichero `.env`** (persistente, recomendado para desarrollo):

   Crea el fichero `backend/.env`:
   ```
   PORT=8080
   PYTHON_BIN=/home/usuario/TartuWalk/backend/venv/bin/python3
   ```

   El servidor lo carga automáticamente si existe (usa el paquete `dotenv`). Si no lo tienes instalado:
   ```bash
   cd backend && npm install dotenv
   ```
   Y añade al principio de `server.js`:
   ```javascript
   require('dotenv').config();
   ```

   > El fichero `.env` ya está en `.gitignore` para que las credenciales no se suban al repositorio.

   **Opción 4 — Con PM2** (persistente en producción):

   Crea `backend/ecosystem.config.js`:
   ```javascript
   module.exports = {
     apps: [{
       name: 'tartu-walk',
       script: 'server.js',
       env: {
         PORT: 3001,
         PYTHON_BIN: '/home/usuario/TartuWalk/backend/venv/bin/python3'
       }
     }]
   };
   ```
   Arranca con:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

   Si cambias el puerto, actualiza también la línea `proxy_pass` en Nginx:
   ```nginx
   proxy_pass http://localhost:8080;
   ```

---

### Opción B: Railway.app (gratis, fácil)

1. Crea una cuenta en [railway.app](https://railway.app)
2. *New Project → Deploy from GitHub repo* → selecciona este repositorio
3. En la configuración del servicio, establece:
   - **Root Directory:** `backend`
   - **Start Command:** `npm start`
4. Railway expone una URL pública automáticamente.

> La capa de contaminación CAMS no funcionará en Railway a menos que instales Python manualmente con un `nixpacks.toml`. En producción sin Python, la app funciona sin esa capa.

---

### Opción C: Render.com (gratis con limitaciones)

1. Crea una cuenta en [render.com](https://render.com)
2. *New → Web Service → Connect a repository*
3. Configura:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Obtendrás una URL tipo `https://tartu-walk.onrender.com`

---

## Variables de Entorno

| Variable      | Por defecto         | Descripción                            |
|---------------|---------------------|----------------------------------------|
| `PORT`        | `3001`              | Puerto del servidor                    |
| `PYTHON_BIN`  | auto-detectado      | Ruta al ejecutable Python (opcional)   |

---

## Comprobación de que todo funciona

```bash
# Health check del servidor
curl http://localhost:3001/health
# → {"status":"ok","timestamp":"..."}

# Test del proxy Overpass
curl -X POST http://localhost:3001/api/overpass \
  -H "Content-Type: application/json" \
  -d '{"query":"[out:json];node(58.37,26.71,58.38,26.72)[amenity=bench];out 1;"}'

# Test de datos de contaminación
curl http://localhost:3001/api/pollution
# → {"timestamp":"YYYY-MM-DD","pm25":[...],"no2":[...],"co":[...]}
# (puede tardar 1-2 minutos la primera vez mientras descarga de CAMS)
```

---

## Solución de Problemas

**El servidor no arranca**
- Verifica que Node.js >= 16: `node --version`
- Verifica que las dependencias están instaladas: `cd backend && npm install`

**La capa de contaminación no carga**
- Comprueba que el venv existe: `ls backend/venv/bin/python3`
- Comprueba que la API key de CAMS es correcta en `cams_fetch.py`
- Verifica que aceptaste los términos del dataset en ads.atmosphere.copernicus.eu
- Los datos de CAMS pueden tardar varios minutos la primera vez (descarga ~50 MB)

**Error CORS en el navegador**
- Asegúrate de abrir `http://localhost:3001` (servido por el backend), no el HTML directamente como archivo

**Overpass lento o con errores 504**
- Normal en horas punta. El servidor reintenta automáticamente con 3 endpoints distintos.

**Puerto 3001 ocupado**
- `PORT=3002 npm start`
