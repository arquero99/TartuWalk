# TartuWalk - Guía de Deployment

## 📌 Resumen

Este proyecto tiene dos partes:

1. **Frontend** (`tartu-walker.html`) - Interfaz web
2. **Backend** (`backend/`) - Proxy para APIs (resuelve CORS)

Para funcionar online, ambas partes deben estar disponibles.

---

## 🚀 Opción Recomendada: Vercel (TODO JUNTO)

### Paso 1: Preparar el proyecto

```bash
# Asegúrate de estar en la raíz del proyecto
cd /home/labie/TartuWalk

# Crea un archivo index.html que redirija al HTML principal
echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=tartu-walker.html"></head></html>' > index.html
```

### Paso 2: Estructura de carpetas para Vercel

```
TartuWalk/
├── index.html
├── tartu-walker.html
├── Addresses.txt
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── vercel.json
│   └── ...
└── vercel.json  (crear en raíz)
```

### Paso 3: Crear `vercel.json` en la raíz

```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/backend/server.js"
    },
    {
      "source": "/(.*)",
      "destination": "/$1"
    }
  ]
}
```

### Paso 4: Instalar Vercel CLI y desplegar

```bash
npm install -g vercel
vercel
```

Vercel te hará preguntas:
- Scope: tu usuario
- Project name: tartu-walk
- Framework: Next.js (elige incluso aunque no sea Next, es flexible)
- Root directory: ./

### Paso 5: Actualizar HTML

Ve a `tartu-walker.html` y busca `BACKEND_URL`. Debería detectar automáticamente:
- En `example.vercel.app`: usa `https://example.vercel.app` para el backend
- En localhost: usa `http://localhost:3001`

Si no, puedes editar manualmente:
```javascript
BACKEND_URL: 'https://tu-proyecto.vercel.app'
```

---

## 🏤 Alternativa: Dos Deployment Separados

Si prefieres alojar frontend y backend en servicios diferentes:

### Frontend en Vercel
```bash
# Solo sube tartu-walker.html, Addresses.txt, etc.
vercel
```

### Backend en Railway/Heroku
```bash
cd backend
# Verifica railway.json o Procfile existen
railway up  # o git push heroku main
```

Luego edita `CONFIG.BACKEND_URL` en HTML:
```javascript
BACKEND_URL: 'https://tu-backend.herokuapp.com'
```

---

## 📝 Configuración para Hosting Personalizado

Si tienes tu propio servidor:

1. **Frontend:** Coloca `tartu-walker.html` en el servidor web (Apache/Nginx)
2. **Backend:** Ejecuta `node backend/server.js` en puerto específico
3. **Nginx Config:**
   ```nginx
   server {
       listen 80;
       server_name tucdominio.com;
       
       root /ruta/a/TartuWalk;
       
       location /api/ {
           proxy_pass http://localhost:3001;
       }
       
       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```

---

## ✅ Checklist Final

- [ ] Backend instalado y funcionando (`npm install` en `backend/`)
- [ ] HTML actualizado con `CONFIG.BACKEND_URL` correcto
- [ ] Backend deployado en producción
- [ ] HTML deployado en producción
- [ ] Probado: puede geocodificar una dirección
- [ ] Probado: puede buscar una ruta

---

## 🧪 Test Local

```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Servir HTML (Python 3)
cd .. && python3 -m http.server 8000

# Navegador: http://localhost:8000/tartu-walker.html
```

---

## 📞 Soporte

- Backend no responde: verifica que npm install corrió en `backend/`
- CORS error persiste: asegúrate que `CONFIG.BACKEND_URL` es correcto
- API lenta: Overpass es lenta, paciencia o cachea con Redis

¡Listo! 🎉
