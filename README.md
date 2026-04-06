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

| Método | Ruta | URL Completa | Descripción |
|--------|------|--------------|-------------|
| GET | `/api/status` | `http://localhost:3000/api/status` | Estado de conexión de WhatsApp |
| GET | `/api/qr` | `http://localhost:3000/api/qr` | QR en base64 para escanear |
| POST | `/api/disconnect` | `http://localhost:3000/api/disconnect` | Cerrar sesión |

### Mensajes

| Método | Ruta | URL Completa | Descripción |
|--------|------|--------------|-------------|
| POST | `/api/send/single` | `http://localhost:3000/api/send/single` | Enviar mensaje individual |
| POST | `/api/send/bulk` | `http://localhost:3000/api/send/bulk` | Envío masivo con campaña |
| POST | `/api/upload` | `http://localhost:3000/api/upload` | Subir archivo (imagen/doc) |

### Campañas

| Método | Ruta | URL Completa | Descripción |
|--------|------|--------------|-------------|
| GET | `/api/campaigns` | `http://localhost:3000/api/campaigns` | Listar todas las campañas |
| GET | `/api/campaigns/:id` | `http://localhost:3000/api/campaigns/CAMPAIGN_ID` | Detalle y progreso |
| POST | `/api/campaigns/:id/cancel` | `http://localhost:3000/api/campaigns/CAMPAIGN_ID/cancel` | Cancelar campaña activa |
| DELETE | `/api/campaigns/:id` | `http://localhost:3000/api/campaigns/CAMPAIGN_ID` | Eliminar del historial |

---

## 📨 Ejemplos de uso

---

### ✉️ POST `/api/send/single` — Enviar mensaje de texto

**Paso 1** — Asegúrate de estar conectado (escanea el QR si no lo has hecho):
```
GET http://localhost:3000/api/qr
```

**Paso 2** — Haz la petición POST con el número y texto:
```bash
curl -X POST http://localhost:3000/api/send/single \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "51987654321",
    "text": "Hola, este es un mensaje de prueba"
  }'
```

**Paso 3** — Verifica la respuesta exitosa:
```json
{
  "exito": true,
  "mensaje": "Mensaje enviado exitosamente",
  "datos": {
    "message_id": "uuid-del-mensaje",
    "telefono": "51987654321",
    "tipo": "texto",
    "enviado_en": "2024-04-01T15:30:00.000Z"
  }
}
```

---

### 🖼️ POST `/api/send/single` — Enviar imagen

**Paso 1** — Sube la imagen al servidor:
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/ruta/a/tu/imagen.jpg"
```

**Paso 2** — Usa la URL obtenida para enviar la imagen:
```bash
curl -X POST http://localhost:3000/api/send/single \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "51987654321",
    "type": "imagen",
    "file_url": "http://localhost:3000/uploads/1711234567-imagen.jpg",
    "text": "Mira esta imagen 👆"
  }'
```

**Paso 3** — Verifica la respuesta exitosa:
```json
{
  "exito": true,
  "mensaje": "Mensaje enviado exitosamente",
  "datos": {
    "message_id": "uuid-del-mensaje",
    "telefono": "51987654321",
    "tipo": "imagen",
    "enviado_en": "2024-04-01T15:30:00.000Z"
  }
}
```

---

### 📄 POST `/api/send/single` — Enviar documento (PDF, Word, Excel)

**Paso 1** — Sube el documento al servidor:
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/ruta/a/tu/factura.pdf"
```

**Paso 2** — Envía el documento con la URL obtenida:
```bash
curl -X POST http://localhost:3000/api/send/single \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "51987654321",
    "type": "documento",
    "file_url": "http://localhost:3000/uploads/1711234567-factura.pdf",
    "filename": "Factura_F001-00234.pdf",
    "mime_type": "application/pdf",
    "text": "Adjuntamos tu factura del mes de abril"
  }'
```

**Paso 3** — Verifica la respuesta exitosa:
```json
{
  "exito": true,
  "mensaje": "Mensaje enviado exitosamente",
  "datos": {
    "message_id": "uuid-del-mensaje",
    "telefono": "51987654321",
    "tipo": "documento",
    "enviado_en": "2024-04-01T15:30:00.000Z"
  }
}
```

---

### 📣 POST `/api/send/bulk` — Envío masivo con variables

**Paso 1** — Crea la campaña con la lista de destinatarios:
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

**Paso 2** — Guarda el `campaign_id` de la respuesta:
```json
{
  "exito": true,
  "mensaje": "Campaña creada y en cola de procesamiento",
  "datos": {
    "campaign_id": "f3c0571f-a146-49a9-a9f0-67868c1bc044",
    "nombre": "Promo Abril",
    "total_mensajes": 2,
    "estado": "pendiente"
  }
}
```

**Paso 3** — Consulta el progreso con ese ID:
```bash
curl http://localhost:3000/api/campaigns/f3c0571f-a146-49a9-a9f0-67868c1bc044
```

---

### ⛔ POST `/api/campaigns/:id/cancel` — Cancelar campaña activa

**Paso 1** — Confirma que la campaña esté en proceso:
```bash
curl http://localhost:3000/api/campaigns/f3c0571f-a146-49a9-a9f0-67868c1bc044
```

**Paso 2** — Envía la solicitud de cancelación:
```bash
curl -X POST http://localhost:3000/api/campaigns/f3c0571f-a146-49a9-a9f0-67868c1bc044/cancel
```

**Paso 3** — Verifica la respuesta:
```json
{
  "exito": true,
  "mensaje": "Solicitud de cancelación enviada. El proceso se detendrá en el próximo mensaje."
}
```

---

### 🔌 POST `/api/disconnect` — Cerrar sesión

**Paso 1** — Confirma que hay una sesión activa:
```bash
curl http://localhost:3000/api/status
```

**Paso 2** — Envía la solicitud de desconexión:
```bash
curl -X POST http://localhost:3000/api/disconnect
```

**Paso 3** — Verifica la respuesta:
```json
{
  "exito": true,
  "mensaje": "WhatsApp desconectado exitosamente"
}
```
> ⚠️ Después de desconectar deberás escanear el QR de nuevo en `http://localhost:3000/api/qr`

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
- Espera 5-10 segundos y recarga `http://localhost:3000/api/qr`
- Verifica que el servidor esté corriendo

**Error "no está conectado":**
- Escanea primero el QR en `http://localhost:3000/api/qr`
- Verifica que el teléfono tenga internet

**Mensajes no se envían:**
- Verifica el formato del número (código de país sin +)
- Revisa los logs en `./logs/app.log`

**Sesión expirada:**
- Elimina la carpeta `./sessions/`
- Reinicia el servidor y escanea el QR de nuevo