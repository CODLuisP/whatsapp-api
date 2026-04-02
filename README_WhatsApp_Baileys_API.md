# WhatsApp Bulk API — Documentación completa

Backend REST para envío automatizado de mensajes de WhatsApp usando Baileys.  
Permite envío individual, masivo, imágenes, documentos y tracking en tiempo real.

---

## Requisitos previos

- Node.js v18 o superior
- npm v8 o superior
- Un celular con WhatsApp activo para escanear el QR

---

## Instalación

```bash
# 1. Entrar a la carpeta del proyecto
cd whatsapp-api

# 2. Instalar dependencias
npm install

# 3. Crear archivo de variables de entorno
copy .env.example .env

# 4. Arrancar el servidor
npm run dev
```

---

## Configuración del .env

```env
PORT=3000
NODE_ENV=development
SESSION_DIR=./sessions
QUEUE_MIN_DELAY=2000
QUEUE_MAX_DELAY=5000
DATABASE_PATH=./data/whatsapp.db
UPLOADS_DIR=./uploads
MAX_FILE_SIZE_MB=50
LOG_LEVEL=info
LOG_DIR=./logs
API_KEY=                        # opcional — para proteger endpoints
```

---

## Conectar WhatsApp

1. Arranca el servidor con `npm run dev`
2. Abre en el navegador: `http://localhost:3000/api/qr`
3. Escanea el QR con WhatsApp → Dispositivos vinculados → Vincular dispositivo
4. La sesión se guarda automáticamente en `./sessions/`
5. La próxima vez que arranques el servidor NO necesitas escanear de nuevo

---

## Base URL

```
http://localhost:3000
```

---

## Endpoints

---

### 1. GET /

Información general de la API y lista de endpoints disponibles.

**Request:**
```
GET http://localhost:3000/
```

**Response:**
```json
{
  "nombre": "WhatsApp Bulk API",
  "version": "1.0.0",
  "estado": "activo",
  "endpoints": {
    "estado": "GET /api/status",
    "qr": "GET /api/qr",
    "enviarUno": "POST /api/send/single",
    "enviarMasivo": "POST /api/send/bulk",
    "campañas": "GET /api/campaigns",
    "detalleCampaña": "GET /api/campaigns/:id"
  },
  "websocket": "Conectar a Socket.IO para progreso en tiempo real"
}
```

---

### 2. GET /api/status

Retorna el estado actual de la conexión con WhatsApp.

**Request:**
```
GET http://localhost:3000/api/status
```

**Response — desconectado:**
```json
{
  "exito": true,
  "datos": {
    "estado": "desconectado",
    "usuario": null,
    "numero": null,
    "tieneQR": false,
    "mensaje": "❌ No conectado - Escanea el QR"
  }
}
```

**Response — esperando QR:**
```json
{
  "exito": true,
  "datos": {
    "estado": "qr",
    "usuario": null,
    "numero": null,
    "tieneQR": true,
    "mensaje": "📱 Esperando escaneo del QR"
  }
}
```

**Response — conectado:**
```json
{
  "exito": true,
  "datos": {
    "estado": "conectado",
    "usuario": "Juan Pérez",
    "numero": "51987654321@s.whatsapp.net",
    "tieneQR": false,
    "mensaje": "✅ Conectado y listo"
  }
}
```

**Estados posibles:**
| Estado | Significado |
|---|---|
| `desconectado` | Sin sesión activa |
| `conectando` | Intentando conectar |
| `qr` | Esperando escaneo del QR |
| `conectado` | Listo para enviar mensajes |
| `reconectando` | Reconexión automática en curso |
| `error` | Error de conexión |

---

### 3. GET /api/qr

Retorna el código QR en formato base64 para escanearlo con WhatsApp.

**Request:**
```
GET http://localhost:3000/api/qr
```

**Response — QR disponible:**
```json
{
  "exito": true,
  "datos": {
    "estado": "qr_disponible",
    "mensaje": "Escanea este QR con WhatsApp para conectar",
    "qr": "data:image/png;base64,iVBORw0KGgoAAAANS..."
  }
}
```

**Response — ya conectado:**
```json
{
  "exito": true,
  "datos": {
    "estado": "conectado",
    "mensaje": "Ya estás conectado, no necesitas escanear el QR",
    "qr": null
  }
}
```

**Response — QR no disponible aún:**
```json
{
  "exito": false,
  "datos": {
    "estado": "conectando",
    "mensaje": "QR no disponible todavía. Espera unos segundos e intenta de nuevo.",
    "qr": null
  }
}
```

**Cómo mostrar el QR en HTML:**
```html
<img id="qr" />
<script>
  fetch('http://localhost:3000/api/qr')
    .then(r => r.json())
    .then(data => {
      document.getElementById('qr').src = data.datos.qr;
    });
</script>
```

**Importante:** El QR expira cada 20 segundos. Baileys genera uno nuevo automáticamente y lo emite por Socket.IO en el evento `qr_actualizado`.

---

### 4. POST /api/disconnect

Cierra la sesión de WhatsApp y elimina los archivos de sesión guardados.

**Request:**
```
POST http://localhost:3000/api/disconnect
```

**Response:**
```json
{
  "exito": true,
  "mensaje": "WhatsApp desconectado exitosamente"
}
```

**Importante:** Después de desconectar deberás escanear el QR de nuevo para reconectar.

---

### 5. POST /api/send/single

Envía un mensaje individual a un número de teléfono.  
Soporta tres tipos: texto, imagen y documento.

**Formato del número:** Código de país + número, sin espacios ni guiones, sin el +  
Ejemplo Perú: `51987654321`

---

#### 5A. Enviar mensaje de texto

**Request:**
```
POST http://localhost:3000/api/send/single
Content-Type: application/json
```

```json
{
  "phone": "51987654321",
  "text": "Hola! Este es un mensaje de prueba",
  "type": "texto"
}
```

**Con variables personalizadas:**
```json
{
  "phone": "51987654321",
  "text": "Hola Juan, tu pedido #4521 está listo para recojo",
  "type": "texto"
}
```

---

#### 5B. Enviar imagen

Primero sube la imagen con `/api/upload` para obtener la URL, luego úsala aquí.

**Request:**
```json
{
  "phone": "51987654321",
  "type": "imagen",
  "file_url": "http://localhost:3000/uploads/1711234567-imagen.jpg",
  "text": "Mira nuestro catálogo de productos"
}
```

El campo `text` es el caption que aparece debajo de la imagen. Es opcional.

---

#### 5C. Enviar documento (PDF, Word, Excel, etc.)

**Request:**
```json
{
  "phone": "51987654321",
  "type": "documento",
  "file_url": "http://localhost:3000/uploads/1711234567-factura.pdf",
  "filename": "Factura_F001-00234.pdf",
  "mime_type": "application/pdf",
  "text": "Adjuntamos tu factura del mes de abril"
}
```

**Tipos MIME más comunes:**
| Archivo | mime_type |
|---|---|
| PDF | `application/pdf` |
| Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| ZIP | `application/zip` |
| MP4 | `video/mp4` |

---

**Response exitoso (cualquier tipo):**
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

**Response de error — no conectado:**
```json
{
  "exito": false,
  "error": "WhatsApp no está conectado. Escanea el QR primero."
}
```

---

### 6. POST /api/send/bulk

Crea una campaña de envío masivo. Los mensajes se procesan en background con delays automáticos para evitar bloqueos de WhatsApp.

**Request:**
```
POST http://localhost:3000/api/send/bulk
Content-Type: application/json
```

```json
{
  "campaign_name": "Promo Abril 2024",
  "messages": [
    {
      "phone": "51987654321",
      "text": "Hola {nombre}, tenemos un 20% de descuento solo hoy 🎉",
      "nombre": "Juan"
    },
    {
      "phone": "51912345678",
      "text": "Hola {nombre}, tenemos un 20% de descuento solo hoy 🎉",
      "nombre": "María"
    },
    {
      "phone": "51955555555",
      "text": "Hola {nombre}, tenemos un 20% de descuento solo hoy 🎉",
      "nombre": "Carlos"
    }
  ],
  "delay_ms": 3000
}
```

**Campos:**
| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `campaign_name` | string | Sí | Nombre identificador de la campaña |
| `messages` | array | Sí | Lista de mensajes a enviar |
| `messages[].phone` | string | Sí | Número con código de país |
| `messages[].text` | string | Sí | Texto del mensaje, puede tener `{variables}` |
| `messages[].type` | string | No | `texto`, `imagen`, `documento`. Default: `texto` |
| `messages[].file_url` | string | No* | URL del archivo. Requerido para imagen/documento |
| `delay_ms` | number | No | Delay entre mensajes en ms. Default: 3000. Mínimo: 1000 |

**Variables en el texto:**  
Cualquier campo extra que no sea `phone`, `text`, `type`, `file_url` se trata como variable. Si el texto tiene `{nombre}` y el objeto tiene `"nombre": "Juan"`, se reemplaza automáticamente.

**Response inmediato:**
```json
{
  "exito": true,
  "mensaje": "Campaña creada y en cola de procesamiento",
  "datos": {
    "campaign_id": "f3c0571f-a146-49a9-a9f0-67868c1bc044",
    "nombre": "Promo Abril 2024",
    "total_mensajes": 3,
    "delay_ms": 3000,
    "estado": "pendiente",
    "progreso_url": "/api/campaigns/f3c0571f-a146-49a9-a9f0-67868c1bc044"
  }
}
```

La API responde con código `202 Accepted` inmediatamente. El envío ocurre en background. Usa el `campaign_id` para consultar el progreso.

---

### 7. POST /api/upload

Sube un archivo al servidor y retorna su URL para usarla en mensajes.

**Request:**
```
POST http://localhost:3000/api/upload
Content-Type: multipart/form-data
```

El body debe ser `form-data` con un campo llamado `file`.

**En Postman:**
- Body → form-data
- Key: `file` (tipo File)
- Value: selecciona el archivo

**Response:**
```json
{
  "exito": true,
  "datos": {
    "filename": "1711234567890-987654321-catalogo.pdf",
    "originalname": "catalogo_abril.pdf",
    "mimetype": "application/pdf",
    "size": 245678,
    "url": "http://localhost:3000/uploads/1711234567890-987654321-catalogo.pdf"
  }
}
```

Usa el campo `url` en el campo `file_url` de los endpoints de envío.

**Límite de tamaño:** 50MB por archivo (configurable en `.env`)

**Tipos aceptados:** JPG, PNG, GIF, WEBP, PDF, Word, Excel, ZIP, MP4, MP3

---

### 8. GET /api/campaigns

Lista todas las campañas creadas con sus estadísticas y estado actual.

**Request:**
```
GET http://localhost:3000/api/campaigns
```

**Response:**
```json
{
  "exito": true,
  "datos": {
    "total": 2,
    "campañas": [
      {
        "id": "f3c0571f-a146-49a9-a9f0-67868c1bc044",
        "nombre": "Promo Abril 2024",
        "estado": "completada",
        "total_mensajes": 3,
        "enviados": 2,
        "fallidos": 1,
        "pendientes": 0,
        "delay_ms": 3000,
        "creado_en": "2024-04-01T15:00:00.000Z",
        "completado_en": "2024-04-01T15:00:15.000Z",
        "procesando_ahora": false,
        "porcentaje_completado": 100
      },
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "nombre": "Recordatorio Citas",
        "estado": "en_proceso",
        "total_mensajes": 50,
        "enviados": 23,
        "fallidos": 0,
        "pendientes": 27,
        "delay_ms": 2000,
        "creado_en": "2024-04-01T16:00:00.000Z",
        "completado_en": null,
        "procesando_ahora": true,
        "porcentaje_completado": 46
      }
    ],
    "colas_activas": ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
  }
}
```

**Estados posibles de una campaña:**
| Estado | Significado |
|---|---|
| `pendiente` | Creada pero aún no inició |
| `en_proceso` | Enviando mensajes ahora |
| `completada` | Todos enviados sin errores |
| `completada_con_errores` | Terminó pero algunos fallaron |
| `cancelada` | Cancelada manualmente |
| `error` | Todos los mensajes fallaron |

---

### 9. GET /api/campaigns/:id

Detalle completo de una campaña con el estado de cada mensaje individual.

**Request:**
```
GET http://localhost:3000/api/campaigns/f3c0571f-a146-49a9-a9f0-67868c1bc044
```

**Response:**
```json
{
  "exito": true,
  "datos": {
    "campaña": {
      "id": "f3c0571f-a146-49a9-a9f0-67868c1bc044",
      "nombre": "Promo Abril 2024",
      "estado": "completada_con_errores",
      "total_mensajes": 3,
      "enviados": 2,
      "fallidos": 1,
      "pendientes": 0,
      "delay_ms": 3000,
      "procesando_ahora": false,
      "estadisticas": {
        "total": 3,
        "enviados": 2,
        "fallidos": 1,
        "pendientes": 0,
        "porcentaje_completado": 100
      }
    },
    "mensajes": [
      {
        "id": "msg-uuid-1",
        "telefono": "51987654321",
        "texto": "Hola Juan, tenemos un 20% de descuento solo hoy 🎉",
        "tipo": "texto",
        "estado": "enviado",
        "error": null,
        "intentos": 1,
        "creado_en": "2024-04-01T15:00:00.000Z",
        "enviado_en": "2024-04-01T15:00:02.000Z"
      },
      {
        "id": "msg-uuid-2",
        "telefono": "51912345678",
        "texto": "Hola María, tenemos un 20% de descuento solo hoy 🎉",
        "tipo": "texto",
        "estado": "enviado",
        "error": null,
        "intentos": 1,
        "creado_en": "2024-04-01T15:00:00.000Z",
        "enviado_en": "2024-04-01T15:00:05.000Z"
      },
      {
        "id": "msg-uuid-3",
        "telefono": "51955555555",
        "texto": "Hola Carlos, tenemos un 20% de descuento solo hoy 🎉",
        "tipo": "texto",
        "estado": "fallido",
        "error": "El número no existe en WhatsApp",
        "intentos": 1,
        "creado_en": "2024-04-01T15:00:00.000Z",
        "enviado_en": null
      }
    ]
  }
}
```

---

### 10. POST /api/campaigns/:id/cancel

Cancela una campaña que está siendo procesada en este momento.

**Request:**
```
POST http://localhost:3000/api/campaigns/f3c0571f-a146-49a9-a9f0-67868c1bc044/cancel
```

**Response exitoso:**
```json
{
  "exito": true,
  "mensaje": "Solicitud de cancelación enviada. El proceso se detendrá en el próximo mensaje."
}
```

**Response — campaña no activa:**
```json
{
  "exito": false,
  "error": "La campaña no está en procesamiento actualmente"
}
```

**Importante:** La cancelación no es inmediata. El sistema termina de enviar el mensaje actual y se detiene antes del siguiente.

---

## Socket.IO — Tiempo real

Conecta a Socket.IO para recibir actualizaciones en tiempo real sin hacer polling.

**Conexión:**
```javascript
const socket = io('http://localhost:3000');
```

**Eventos que emite el servidor:**

### qr_actualizado
Se emite cuando Baileys genera un nuevo QR (cada ~20 segundos).
```javascript
socket.on('qr_actualizado', ({ qr }) => {
  document.getElementById('qr-img').src = qr;
});
```

### estado_conexion
Se emite cuando cambia el estado de la conexión WhatsApp.
```javascript
socket.on('estado_conexion', ({ estado, usuario, numero, mensaje }) => {
  console.log(estado);   // conectado, desconectado, qr, etc.
  console.log(usuario);  // nombre del usuario conectado
});
```

### progreso_campaña
Se emite después de cada mensaje durante un envío masivo.
```javascript
socket.on('progreso_campaña', (data) => {
  console.log(data.evento);     // mensaje_enviado, mensaje_fallido, campaña_completada
  console.log(data.telefono);   // número al que se envió
  console.log(data.progreso);   // { actual, total, enviados, fallidos, pendientes, porcentaje }
});
```

**Suscribirse a una campaña específica** (recibir solo sus eventos):
```javascript
socket.emit('suscribir_campaña', 'f3c0571f-a146-49a9-a9f0-67868c1bc044');
```

---

## Flujo completo de ejemplo

### Enviar factura PDF a un cliente

```
1. Subir el PDF
   POST /api/upload
   → Obtienes la URL del archivo

2. Enviar el mensaje con el PDF
   POST /api/send/single
   {
     "phone": "51987654321",
     "type": "documento",
     "file_url": "http://localhost:3000/uploads/factura.pdf",
     "filename": "Factura_F001-00234.pdf",
     "mime_type": "application/pdf",
     "text": "Estimado cliente, adjuntamos su factura"
   }
   → El cliente recibe el PDF en WhatsApp
```

### Campaña masiva de marketing

```
1. Crear la campaña
   POST /api/send/bulk
   → Obtienes el campaign_id

2. Conectar Socket.IO y suscribirse
   socket.emit('suscribir_campaña', campaign_id)

3. Escuchar el progreso en tiempo real
   socket.on('progreso_campaña', (data) => { ... })

4. Consultar estado cuando quieras
   GET /api/campaigns/:campaign_id

5. Cancelar si es necesario
   POST /api/campaigns/:campaign_id/cancel
```

---

## Códigos de respuesta HTTP

| Código | Significado |
|---|---|
| 200 | Éxito |
| 202 | Aceptado (envío masivo en background) |
| 400 | Error de validación — datos incorrectos |
| 404 | Campaña o ruta no encontrada |
| 500 | Error interno del servidor |
| 503 | WhatsApp no está conectado |

---

## Buenas prácticas para evitar bloqueos

- Usa siempre un delay mínimo de **2000ms** entre mensajes en envíos masivos
- No envíes el mismo mensaje idéntico a miles de personas simultáneamente
- Personaliza cada mensaje con variables como el nombre del destinatario
- Envía en horario laboral — evita madrugadas
- No envíes a números que no te conocen de forma masiva
- Mantén el número activo con conversaciones normales también

---

## Estructura de archivos del proyecto

```
whatsapp-api/
├── index.js                         ← Servidor Express + Socket.IO
├── package.json                     ← Dependencias
├── .env                             ← Variables de entorno
├── src/
│   ├── routes/
│   │   ├── status.routes.js         ← Rutas de estado y QR
│   │   ├── message.routes.js        ← Rutas de envío y upload
│   │   └── campaign.routes.js       ← Rutas de campañas
│   ├── controllers/
│   │   ├── status.controller.js     ← Lógica de estado y QR
│   │   ├── message.controller.js    ← Lógica de envío
│   │   └── campaign.controller.js   ← Lógica de campañas
│   ├── services/
│   │   ├── whatsapp.service.js      ← Conexión Baileys con WhatsApp
│   │   └── queue.service.js         ← Cola de mensajes masivos
│   ├── middlewares/
│   │   └── auth.middleware.js       ← Protección con API Key
│   └── utils/
│       ├── database.js              ← Base de datos SQLite
│       └── logger.js                ← Sistema de logs
├── sessions/                        ← Sesión del QR (no subir a Git)
├── uploads/                         ← Archivos subidos
├── data/                            ← Base de datos SQLite
└── logs/                            ← Archivos de log
```
