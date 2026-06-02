# OpenStreetWalker — Guía de Despliegue en Producción

**Dominio:** `openstreetwalker.app`
**Registrador:** name.com → DNS gestionado por Cloudflare
**Servidor:** Ubuntu 22.04 LTS en red universitaria (UPM)
**IP pública fija:** `138.100.47.11` (asignada por la universidad)
**IP local del servidor:** `10.47.5.17` (red interna `10.47.0.0/21`)

## Arquitectura

```
Navegador --[HTTPS]--> Cloudflare Edge --[HTTP/2 túnel]--> cloudflared --[HTTP]--> Node.js :3001
```

- **Cloudflare Tunnel** resuelve la imposibilidad de abrir puertos en la red universitaria.
- **Cloudflare** gestiona HTTPS/TLS. No se necesita Nginx ni certbot.
- El túnel usa **HTTP/2** (en lugar de QUIC/UDP) porque la red universitaria bloquea UDP saliente.
- Node.js corre gestionado por **PM2** y cloudflared como servicio **systemd**.

---

## Índice

1. [Configuración DNS en Cloudflare](#1-configuración-dns-en-cloudflare)
2. [Preparación del servidor](#2-preparación-del-servidor)
3. [IP estática en la máquina servidor](#3-ip-estática-en-la-máquina-servidor)
4. [Instalación de dependencias](#4-instalación-de-dependencias)
5. [Despliegue de la aplicación](#5-despliegue-de-la-aplicación)
6. [PM2 — gestión del proceso Node.js](#6-pm2--gestión-del-proceso-nodejs)
7. [Cloudflare Tunnel](#7-cloudflare-tunnel)
8. [Cloudflare — configuración final](#8-cloudflare--configuración-final)
9. [Variables de entorno](#9-variables-de-entorno)
10. [Verificación final](#10-verificación-final)
11. [Actualizaciones](#11-actualizaciones)
12. [Solución de problemas](#12-solución-de-problemas)
13. [Acceso SSH desde un equipo externo](#13-acceso-ssh-desde-un-equipo-externo)

---

## 1. Configuración DNS en Cloudflare

El DNS del dominio está gestionado por **Cloudflare** (no por name.com directamente).

### 1.1 Transferencia del DNS a Cloudflare

Si partes de cero:

1. Crea una cuenta en [cloudflare.com](https://cloudflare.com) → **Add a Site** → `openstreetwalker.app` → plan **Free**
2. Cloudflare escanea los registros DNS existentes
3. Anota los dos nameservers que Cloudflare asigna (p. ej. `dana.ns.cloudflare.com`)
4. En name.com → **My Domains** → `openstreetwalker.app` → **Nameservers** → **Use custom nameservers** → pega los nameservers de Cloudflare
5. Espera la propagación (5 min – 24h). Para verificar: `dig NS openstreetwalker.app +short`

### 1.2 Registros DNS activos

Los registros A originales se eliminan y son sustituidos por CNAMEs del túnel (creados automáticamente en el paso 7):

| Tipo | Nombre | Contenido |
|------|--------|-----------|
| `CNAME` | `openstreetwalker.app` | `<TUNNEL_ID>.cfargotunnel.com` |
| `CNAME` | `www` | `<TUNNEL_ID>.cfargotunnel.com` |

> Estos registros los crea `cloudflared tunnel route dns` automáticamente. No los crees a mano.

### 1.3 Certificado SSL (Universal)

Cloudflare emite y renueva el certificado automáticamente. El proceso puede requerir validación DNS:

- En **SSL/TLS → Edge Certificates** el estado debe ser **Active**
- Si aparece *Pending Validation (TXT)*, Cloudflare añade los registros `_acme-challenge` por sí solo — no hace falta añadirlos manualmente
- La validación puede tardar hasta 15-30 minutos tras la propagación de nameservers

---

## 2. Preparación del servidor

### 2.1 Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
```

### 2.2 Instalar dependencias

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Python 3 y pip
sudo apt install -y python3 python3-pip python3-venv

# Git
sudo apt install -y git

# PM2
sudo npm install -g pm2
```

---

## 3. IP estática en la máquina servidor

La máquina tiene IP dinámica asignada por DHCP. Para que la configuración del túnel sea estable, se fija con NetworkManager (renderer por defecto en Ubuntu 22.04 con escritorio).

### 3.1 Obtener datos de red actuales

```bash
ip addr show        # → interfaz (ej. enp0s31f6), IP actual y máscara
ip route show       # → gateway (via x.x.x.x)
nmcli connection show   # → nombre de la conexión
```

Valores de este servidor:

| Parámetro | Valor |
|-----------|-------|
| Interfaz | `enp0s31f6` |
| IP fija | `10.47.5.17/21` |
| Gateway | `10.47.0.1` |
| MAC | `e0:d5:5e:27:c9:d2` |

### 3.2 Asignar IP estática con nmcli

```bash
# Sustituye "Wired connection 1" por el nombre que devuelva nmcli connection show
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses "10.47.5.17/21" \
  ipv4.gateway "10.47.0.1" \
  ipv4.dns "8.8.8.8,1.1.1.1"

nmcli connection down "Wired connection 1" && \
nmcli connection up "Wired connection 1"

# Verifica
ip addr show enp0s31f6 | grep inet
```

---

## 4. Instalación de dependencias

No se necesita Nginx ni certbot.

---

## 5. Despliegue de la aplicación

### 5.1 Clonar el repositorio

```bash
cd ~
git clone https://github.com/TU_USUARIO/TartuWalk.git
cd TartuWalk
```

### 5.2 Instalar dependencias Node.js

```bash
cd backend
npm install --omit=dev
```

### 5.3 Crear el entorno virtual Python

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
```

### 5.4 Crear el fichero `.env`

```bash
cp .env.example .env
nano .env
```

```dotenv
PORT=3001
PYTHON_BIN=/home/labie/TartuWalk/backend/venv/bin/python3
ADS_URL=https://ads.atmosphere.copernicus.eu/api
ADS_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

```bash
chmod 600 .env
```

---

## 6. PM2 — gestión del proceso Node.js

### 6.1 Crear el fichero de configuración

```bash
nano ~/TartuWalk/backend/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'openstreetwalker',
    script: 'server.js',
    cwd: '/home/labie/TartuWalk/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      PYTHON_BIN: '/home/labie/TartuWalk/backend/venv/bin/python3'
    },
    error_file: '/home/labie/logs/osw-error.log',
    out_file:   '/home/labie/logs/osw-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### 6.2 Arrancar y configurar inicio automático

```bash
mkdir -p ~/logs
cd ~/TartuWalk/backend
pm2 start ecosystem.config.js

# Genera el comando de startup — ejecútalo tal cual te lo imprima
pm2 startup systemd

pm2 save
```

### 6.3 Comandos útiles

```bash
pm2 status
pm2 logs openstreetwalker --lines 100
pm2 reload openstreetwalker      # reinicio zero-downtime
pm2 restart openstreetwalker
```

---

## 7. Cloudflare Tunnel

### 7.1 Instalar cloudflared

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

### 7.2 Autenticarse

```bash
cloudflared tunnel login
```

Copia la URL que aparece y ábrela en el navegador. Selecciona `openstreetwalker.app`. El certificado se guarda en `~/.cloudflared/cert.pem`.

### 7.3 Crear el túnel

```bash
cloudflared tunnel create openstreetwalker
```

Anota el **Tunnel ID** (UUID) que aparece.

### 7.4 Crear la configuración

```bash
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: openstreetwalker
credentials-file: /home/labie/.cloudflared/<TUNNEL_ID>.json
protocol: http2

ingress:
  - hostname: openstreetwalker.app
    service: http://localhost:3001
  - hostname: www.openstreetwalker.app
    service: http://localhost:3001
  - service: http_status:404
```

> **`protocol: http2` es necesario** porque la red universitaria bloquea UDP/QUIC (puerto 7844 saliente). Sin esta línea el túnel intenta QUIC, falla, y tarda varios minutos en caer al fallback.

### 7.5 Crear registros DNS

Antes de ejecutar estos comandos, elimina en el panel de Cloudflare cualquier registro `A` existente para `@` y `www`:

```bash
cloudflared tunnel route dns openstreetwalker openstreetwalker.app
cloudflared tunnel route dns openstreetwalker www.openstreetwalker.app
```

Esto crea automáticamente los CNAME `<TUNNEL_ID>.cfargotunnel.com` en Cloudflare DNS.

### 7.6 Instalar como servicio systemd

`cloudflared service install` busca el config en `/etc/cloudflared/`, no en el home del usuario. Hay que copiar los ficheros primero:

```bash
sudo mkdir -p /etc/cloudflared

# Copia config y credenciales del túnel
sudo cp /home/labie/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp /home/labie/.cloudflared/*.json /etc/cloudflared/

# Actualiza la ruta de credenciales dentro del config copiado
sudo sed -i 's|/home/labie/.cloudflared/|/etc/cloudflared/|g' /etc/cloudflared/config.yml

# Verifica el resultado
sudo cat /etc/cloudflared/config.yml

# Instala y arranca el servicio
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

---

## 8. Cloudflare — configuración final

Una vez el certificado SSL esté **Active**:

**SSL/TLS → Edge Certificates:**
- **Always Use HTTPS** → activado (redirige HTTP → HTTPS automáticamente)
- **Minimum TLS Version** → TLS 1.2

**SSL/TLS → Overview:**
- **SSL/TLS encryption mode** → **Full** (el túnel usa HTTP internamente, Full es correcto; no usar Full (strict))

---

## 9. Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `PORT` | No | Puerto del servidor (default: `3001`) |
| `PYTHON_BIN` | No | Ruta al Python del venv |
| `ADS_URL` | Sí* | URL API Copernicus CAMS |
| `ADS_KEY` | Sí* | API key Copernicus ADS |

> (*) Solo para la capa de calidad del aire. La app funciona sin ellas.

---

## 10. Verificación final

```bash
# Estado de servicios
pm2 status
sudo systemctl status cloudflared

# Health check
curl https://openstreetwalker.app/health
# → {"status":"ok","timestamp":"..."}

# Proxy Overpass
curl -X POST https://openstreetwalker.app/api/overpass \
  -H "Content-Type: application/json" \
  -d '{"query":"[out:json];node(58.37,26.71,58.38,26.72)[amenity=bench];out 1;"}'

# Geocoding
curl "https://openstreetwalker.app/api/geocode?q=Tartu"

# Capa de contaminación (puede tardar 1-2 min la primera vez)
curl https://openstreetwalker.app/api/pollution

# Redirección HTTP → HTTPS
curl -I http://openstreetwalker.app
# → 301 Location: https://openstreetwalker.app/
```

---

## 11. Actualizaciones

```bash
cd ~/TartuWalk

git pull origin main

# Si cambiaron dependencias Node:
cd backend && npm install --omit=dev

# Si cambiaron dependencias Python:
source venv/bin/activate && pip install -r requirements.txt && deactivate

# Reiniciar la app (zero-downtime)
pm2 reload openstreetwalker
```

El túnel de Cloudflare no necesita reiniciarse salvo que cambies `config.yml`.

---

## 12. Solución de problemas

### El sitio no carga

```bash
# ¿Está el túnel conectado?
sudo systemctl status cloudflared
cloudflared tunnel info openstreetwalker

# ¿Está la app corriendo?
pm2 status
curl http://localhost:3001/health

# Logs del túnel
sudo journalctl -u cloudflared -n 50

# Logs de la app
pm2 logs openstreetwalker --lines 50
```

### Error 502 Bad Gateway

La app Node no responde. Verifica y reinicia:

```bash
pm2 restart openstreetwalker
pm2 logs openstreetwalker
```

### El túnel no conecta (QUIC timeout)

La red bloquea UDP. Verifica que `~/.cloudflared/config.yml` tiene `protocol: http2` y reinicia el servicio:

```bash
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -f
# Debe aparecer: "Initial protocol http2" (no "quic")
```

### Certificado SSL en "Pending Validation"

- Verifica que los nameservers apuntan a Cloudflare: `dig NS openstreetwalker.app +short`
- Cloudflare añade los registros `_acme-challenge` automáticamente — no los añadas a mano
- Espera 15-30 minutos tras la propagación de nameservers

### La capa de contaminación no carga

```bash
ls ~/TartuWalk/backend/venv/bin/python3   # ¿existe el venv?
cd ~/TartuWalk/backend
source venv/bin/activate && python3 cams_fetch.py  # test directo
```

### Cannot GET /

El servidor sirve `tartu-walker.html` como índice. Verifica en `server.js` que la línea de static es:

```javascript
app.use(express.static(path.join(__dirname, '..'), { index: 'tartu-walker.html' }));
```

Si falta `{ index: 'tartu-walker.html' }`, añádela y reinicia: `pm2 reload openstreetwalker`.

---

## 13. Acceso SSH desde un equipo externo

### Red universitaria — cómo funciona el NAT

El servidor tiene IP privada `10.47.5.17` dentro de la red universitaria. La IP pública `138.100.47.11` está asignada al router de la universidad, no a la máquina directamente. Para que SSH desde internet llegue al servidor, el router debe reenviar el puerto 22 entrante hacia `10.47.5.17`.

Hay dos opciones según lo que permita el departamento de IT:

---

### Opción A — SSH directo (requiere que IT abra el puerto 22)

Si el departamento de IT de la universidad configura el port forwarding `138.100.47.11:22 → 10.47.5.17:22`, la conexión es directa.

**En el servidor — verificar que SSH está activo:**

```bash
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh
sudo systemctl status ssh
```

**Desde el equipo externo:**

```bash
ssh labie@138.100.47.11
```

**Configuración recomendada del servidor SSH** (`/etc/ssh/sshd_config`):

```bash
sudo nano /etc/ssh/sshd_config
```

Ajusta o verifica estas líneas:

```
PasswordAuthentication no       # solo clave pública
PubkeyAuthentication yes
PermitRootLogin no
Port 22
```

```bash
sudo systemctl restart ssh
```

**Copiar la clave pública desde el equipo externo al servidor:**

```bash
# Ejecuta esto desde el equipo externo (genera la clave si no existe):
ssh-keygen -t ed25519 -C "tu_email@ejemplo.com"

# Copia la clave al servidor (mientras tengas acceso con contraseña):
ssh-copy-id labie@138.100.47.11

# A partir de ahora la conexión usa clave:
ssh labie@138.100.47.11
```

**Atajo con `~/.ssh/config`** (en el equipo externo):

```
Host osw-server
    HostName 138.100.47.11
    User labie
    IdentityFile ~/.ssh/id_ed25519
```

Con esto basta escribir: `ssh osw-server`

---

### Opción B — SSH a través de Cloudflare Tunnel (sin abrir puertos)

Esta opción no requiere ningún cambio en el firewall universitario. El túnel existente gestiona también el tráfico SSH.

**En el servidor — añadir SSH al túnel:**

Edita `~/.cloudflared/config.yml` y añade el ingress para SSH **antes** del catch-all:

```yaml
tunnel: openstreetwalker
credentials-file: /home/labie/.cloudflared/<TUNNEL_ID>.json
protocol: http2

ingress:
  - hostname: openstreetwalker.app
    service: http://localhost:3001
  - hostname: www.openstreetwalker.app
    service: http://localhost:3001
  - hostname: ssh.openstreetwalker.app
    service: ssh://localhost:22
  - service: http_status:404
```

Crea el registro DNS para el subdominio SSH:

```bash
cloudflared tunnel route dns openstreetwalker ssh.openstreetwalker.app
```

Reinicia el servicio del túnel:

```bash
sudo systemctl restart cloudflared
```

**En el equipo externo — instalar cloudflared:**

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux (Debian/Ubuntu)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Windows: descarga el .exe desde
# https://github.com/cloudflare/cloudflared/releases/latest
```

**Configurar SSH para usar el túnel** (`~/.ssh/config` en el equipo externo):

```
Host osw-server
    HostName ssh.openstreetwalker.app
    User labie
    IdentityFile ~/.ssh/id_ed25519
    ProxyCommand cloudflared access ssh --hostname %h
```

**Conectar:**

```bash
ssh osw-server
```

La primera vez, `cloudflared` abrirá una URL en el navegador para autenticarte con tu cuenta de Cloudflare (Cloudflare Access). Tras eso, la conexión se establece de forma transparente.

> Si no quieres configurar Cloudflare Access, puedes usar la opción A (más sencilla) siempre que IT abra el puerto 22.
