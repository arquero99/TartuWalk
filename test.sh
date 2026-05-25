#!/bin/bash
# TartuWalk Testing Script (Local Development)

echo "🚀 TartuWalk - Testing Local Setup"
echo "=================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "   Instálalo desde: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version)"

# Install backend dependencies
echo ""
echo "📦 Instalando dependencias del backend..."
cd backend
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error al instalar dependencias"
    exit 1
fi

echo "✅ Dependencias instaladas"

# Start backend
echo ""
echo "🎯 Iniciando backend en puerto 3001..."
echo "   URL: http://localhost:3001"
echo "   Health check: http://localhost:3001/health"
echo ""
npm start &
BACKEND_PID=$!

# Go back to root and serve HTML
cd ..

echo ""
echo "🌐 Iniciando servidor para HTML en puerto 8000..."
echo "   URL: http://localhost:8000/tartu-walker.html"
echo ""
echo "⏹️  Presiona Ctrl+C para detener"
echo ""

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer 8000
else
    echo "❌ Python no encontrado (necesario para servir HTML)"
    kill $BACKEND_PID
    exit 1
fi

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null
