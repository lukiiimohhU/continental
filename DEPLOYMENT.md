# 🚀 Guía de Despliegue - Juego Continental

Esta guía te ayudará a desplegar tu juego Continental en línea.

## 📋 Stack Tecnológico

- **Frontend**: React (Create React App) con WebSockets
- **Backend**: API REST + WebSockets (continental-backend)

---

## 🎯 Opción Recomendada: Vercel + Render

### ✅ Ventajas
- Planes gratuitos disponibles
- Soporte completo para WebSockets
- Deploy automático desde GitHub
- SSL/HTTPS incluido
- Fácil configuración

---

## 📦 PARTE 1: Desplegar el Backend (continental-backend)

### Paso 1: Preparar el repositorio del backend

1. Ve a tu repositorio `continental-backend` en GitHub
2. Asegúrate de tener un archivo `requirements.txt` (Python) o `package.json` (Node.js)
3. Asegúrate de que tu backend escuche en el puerto que Render proporciona:
   ```python
   # Para FastAPI/Python
   import os
   port = int(os.environ.get("PORT", 8000))
   ```

### Paso 2: Desplegar en Render

1. Ve a [render.com](https://render.com) y crea una cuenta (gratis)
2. Haz clic en **"New +"** → **"Web Service"**
3. Conecta tu repositorio de GitHub `continental-backend`
4. Configura:
   - **Name**: `continental-backend` (o el nombre que prefieras)
   - **Environment**: Python 3 (o Node si usas Node.js)
   - **Build Command**: `pip install -r requirements.txt` (o tu comando)
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT` (ajusta según tu backend)
   - **Plan**: Free
5. En **Environment Variables**, añade las variables necesarias
6. Haz clic en **"Create Web Service"**

### Paso 3: Obtener la URL del backend

Una vez desplegado, Render te dará una URL como:
```
https://continental-backend-XXXX.onrender.com
```

**⚠️ IMPORTANTE**: Guarda esta URL, la necesitarás para el frontend.

---

## 🎨 PARTE 2: Desplegar el Frontend (este repositorio)

### Paso 1: Configurar las variables de entorno

1. Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita `.env` con las URLs de tu backend desplegado:
   ```env
   REACT_APP_BACKEND_URL=https://continental-backend-XXXX.onrender.com/api
   REACT_APP_WS_URL=wss://continental-backend-XXXX.onrender.com/api/ws
   ```

   **Nota**: Para WebSockets en HTTPS usa `wss://` en lugar de `ws://`

### Paso 2: Probar localmente (opcional pero recomendado)

```bash
yarn install
yarn start
```

Verifica que se conecte correctamente al backend desplegado.

### Paso 3: Desplegar en Vercel

#### Opción A: Desde la terminal (recomendado)

1. Instala Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Inicia sesión:
   ```bash
   vercel login
   ```

3. Despliega:
   ```bash
   vercel
   ```

4. Configura las variables de entorno en Vercel:
   ```bash
   vercel env add REACT_APP_BACKEND_URL
   # Pega: https://continental-backend-XXXX.onrender.com/api

   vercel env add REACT_APP_WS_URL
   # Pega: wss://continental-backend-XXXX.onrender.com/api/ws
   ```

5. Despliega a producción:
   ```bash
   vercel --prod
   ```

#### Opción B: Desde la web de Vercel

1. Ve a [vercel.com](https://vercel.com) y crea una cuenta
2. Haz clic en **"Add New"** → **"Project"**
3. Importa tu repositorio de GitHub `continental`
4. Configura:
   - **Framework Preset**: Create React App
   - **Build Command**: `yarn build`
   - **Output Directory**: `build`
5. En **Environment Variables**, añade:
   - `REACT_APP_BACKEND_URL`: `https://continental-backend-XXXX.onrender.com/api`
   - `REACT_APP_WS_URL`: `wss://continental-backend-XXXX.onrender.com/api/ws`
6. Haz clic en **"Deploy"**

### Paso 4: Configurar CORS en el backend

**MUY IMPORTANTE**: Debes configurar CORS en tu backend para permitir peticiones desde tu frontend de Vercel.

En tu backend (ejemplo para FastAPI/Python):

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Para desarrollo local
        "https://tu-app.vercel.app",  # Tu URL de Vercel
        "https://continental-XXXX.vercel.app"  # Si Vercel te da otra URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🎮 ¡Listo! Tu juego está en línea

Accede a tu juego en la URL que te dio Vercel:
```
https://tu-app.vercel.app
```

---

## 🔧 Mantenimiento y Actualizaciones

### Deploy automático
Tanto Vercel como Render se actualizarán automáticamente cuando hagas push a GitHub:

```bash
git add .
git commit -m "Actualización del juego"
git push origin main
```

### Ver logs y errores

- **Vercel**: Dashboard → Tu proyecto → Deployments → Ver logs
- **Render**: Dashboard → Tu servicio → Logs

---

## 🆘 Solución de Problemas

### Error: "Failed to connect to WebSocket"
- Verifica que estás usando `wss://` (con SSL) para WebSockets
- Revisa que la URL del backend sea correcta
- Chequea los logs del backend en Render

### Error: "CORS policy blocked"
- Asegúrate de configurar CORS en el backend
- Añade la URL de Vercel a las origins permitidas

### El backend se duerme (Render free tier)
- Render apaga servicios gratuitos después de 15 min de inactividad
- Primera carga puede tardar ~30 segundos
- Considera usar un "keep-alive" ping o actualizar al plan de pago

---

## 💰 Otras Opciones de Despliegue

### Opción 2: Netlify + Railway
- **Frontend**: [Netlify](https://netlify.com) (similar a Vercel)
- **Backend**: [Railway](https://railway.app) (mejor para WebSockets, $5/mes)

### Opción 3: Todo en un VPS
- **Digital Ocean** / **Linode** / **AWS Lightsail**
- Más control pero requiere configuración manual
- Desde $5/mes

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en Vercel y Render
2. Verifica las variables de entorno
3. Prueba la conexión al backend con `curl` o Postman
4. Revisa la configuración de CORS

¡Buena suerte con tu despliegue! 🎉
