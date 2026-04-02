# 📱 WhatsApp Bulk API

API REST completa para envío masivo de mensajes de WhatsApp usando **Node.js + Baileys**.

---

## 🚀 Instalación paso a paso

### 1. Clonar y entrar al proyecto
```bash
git clone <tu-repo>
cd whatsapp-api
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Edita .env con tus valores
```

### 4. Iniciar el servidor
```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

### 5. Escanear el QR
- Abre `http://localhost:3000/api/qr` en tu navegador
- Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo
- Escanea el QR que aparece

---

## 📡 Endpoints

### Estado y QR

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/status` | Estado de conexión de WhatsApp |
| GET | `/api/qr` | QR en base64 para escanear |
| POST | `/api/disconnect` | Cerrar sesión |

### Mensajes

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/send/single` | Enviar mensaje individual |
| POST | `/api/send/bulk` | Envío masivo con campaña |
| POST | `/api/upload` | Subir archivo (imagen/doc) |

### Campañas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/campaigns` | Listar todas las campañas |
| GET | `/api/campaigns/:id` | Detalle y progreso |
| POST | `/api/campaigns/:id/cancel` | Cancelar campaña activa |
| DELETE | `/api/campaigns/:id` | Eliminar del historial |

---

## 📨 Ejemplos de uso

### Enviar mensaje individual
```bash
curl -X POST http://localhost:3000/api/send/single \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "51987654321",
    "text": "Hola, este es un mensaje de prueba"
  }'
```

### Envío masivo con variables
```bash
curl -X POST http://localhost:3000/api/send/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_name": "Promo Abril",
    "messages": [
      { "phone": "51987654321", "text": "Hola {nombre}, tu descuento es {descuento}%", "nombre": "Juan", "descuento": "20" },
      { "phone": "51912345678", "text": "Hola {nombre}, tu descuento es {descuento}%", "nombre": "María", "descuento": "30" }
    ],
    "delay_ms": 3000
  }'
```

### Enviar imagen
```bash
curl -X POST http://localhost:3000/api/send/single \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "51987654321",
    "text": "Mira esta imagen 👆",
    "type": "imagen",
    "file_url": "https://ejemplo.com/imagen.jpg"
  }'
```

### Ver progreso de campaña
```bash
curl http://localhost:3000/api/campaigns/CAMPAIGN_ID
```

---

## 🔌 Socket.IO - Progreso en tiempo real

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// Suscribirse a una campaña específica
socket.emit('suscribir_campaña', 'CAMPAIGN_ID');

// Escuchar eventos
socket.on('qr_actualizado', ({ qr }) => {
  document.getElementById('qr-img').src = qr;
});

socket.on('estado_conexion', ({ estado, usuario }) => {
  console.log('Estado WhatsApp:', estado, usuario);
});

socket.on('progreso_campaña', (data) => {
  const { evento, progreso } = data;
  console.log(`${evento} - ${progreso?.porcentaje}% completado`);
  console.log(`Enviados: ${progreso?.enviados} | Fallidos: ${progreso?.fallidos}`);
});
```

### Eventos disponibles

| Evento | Cuándo se emite |
|--------|-----------------|
| `qr_actualizado` | Nuevo QR generado |
| `estado_conexion` | Cambio de estado (conectado/desconectado) |
| `progreso_campaña` | Actualización de campaña |

### Sub-eventos de `progreso_campaña`

| Sub-evento | Descripción |
|------------|-------------|
| `campaña_iniciada` | Inicio del procesamiento |
| `mensaje_enviado` | Cada mensaje enviado con éxito |
| `mensaje_fallido` | Mensaje fallido con error |
| `campaña_completada` | Fin del procesamiento |
| `campaña_cancelada` | Campaña cancelada manualmente |

---

## 📁 Estructura del proyecto

```
whatsapp-api/
├── index.js                    # Punto de entrada
├── .env                        # Variables de entorno
├── .env.example                # Ejemplo de configuración
├── package.json
├── src/
│   ├── routes/
│   │   ├── status.routes.js    # Rutas de estado y QR
│   │   ├── message.routes.js   # Rutas de mensajes
│   │   └── campaign.routes.js  # Rutas de campañas
│   ├── controllers/
│   │   ├── status.controller.js
│   │   ├── message.controller.js
│   │   └── campaign.controller.js
│   ├── services/
│   │   ├── whatsapp.service.js # Lógica core de Baileys
│   │   └── queue.service.js    # Cola de mensajes con delay
│   ├── middlewares/
│   │   └── auth.middleware.js  # API Key opcional
│   └── utils/
│       ├── database.js         # SQLite helpers
│       └── logger.js           # Logger con pino
├── sessions/                   # Archivos de sesión WhatsApp (auto)
├── data/                       # Base de datos SQLite (auto)
├── uploads/                    # Archivos subidos
└── logs/                       # Logs de la app
```

---

## ⚙️ Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3000` | Puerto del servidor |
| `SESSION_DIR` | `./sessions` | Carpeta de sesión WhatsApp |
| `QUEUE_MIN_DELAY` | `2000` | Delay mínimo entre mensajes (ms) |
| `QUEUE_MAX_DELAY` | `5000` | Delay máximo entre mensajes (ms) |
| `DATABASE_PATH` | `./data/whatsapp.db` | Ruta de la BD SQLite |
| `UPLOADS_DIR` | `./uploads` | Carpeta de archivos subidos |
| `API_KEY` | *(vacío)* | Clave para proteger endpoints |
| `LOG_LEVEL` | `info` | Nivel de logs (debug/info/warn/error) |

---

## ⚠️ Recomendaciones importantes

1. **Delays**: Usa mínimo 2-3 segundos entre mensajes para evitar bloqueos
2. **Número dedicado**: Usa un número de WhatsApp exclusivo para la API
3. **Sesión persistente**: Los archivos en `./sessions/` mantienen la sesión activa
4. **Backups**: Haz copia de `./sessions/` para no escanear el QR de nuevo
5. **Masivo responsable**: WhatsApp puede bloquear números que envíen spam

---

## 🛠️ Solución de problemas

**El QR no aparece:**
- Espera 5-10 segundos y recarga `/api/qr`
- Verifica que el servidor esté corriendo

**Error "no está conectado":**
- Escanea primero el QR en `/api/qr`
- Verifica que el teléfono tenga internet

**Mensajes no se envían:**
- Verifica el formato del número (código de país sin +)
- Revisa los logs en `./logs/app.log`

**Sesión expirada:**
- Elimina la carpeta `./sessions/`
- Reinicia el servidor y escanea el QR de nuevo
