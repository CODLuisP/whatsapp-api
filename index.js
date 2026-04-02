// ============================================================
// PUNTO DE ENTRADA PRINCIPAL - WhatsApp Bulk API
// ============================================================
require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Importar rutas
const statusRoutes = require('./src/routes/status.routes');
const messageRoutes = require('./src/routes/message.routes');
const campaignRoutes = require('./src/routes/campaign.routes');

// Importar servicios
const whatsappService = require('./src/services/whatsapp.service');
const { initDatabase } = require('./src/utils/database');
const logger = require('./src/utils/logger');

// ── Crear directorios necesarios ──────────────────────────────
const dirs = [
  process.env.SESSION_DIR || './sessions',
  process.env.UPLOADS_DIR || './uploads',
  process.env.LOG_DIR || './logs',
  path.dirname(process.env.DATABASE_PATH || './data/whatsapp.db'),
];

dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Directorio creado: ${dir}`);
  }
});

// ── Inicializar Express ───────────────────────────────────────
const app = express();
const httpServer = createServer(app);

// ── Configurar Socket.IO para progreso en tiempo real ────────
const io = new Server(httpServer, {
  cors: {
    origin: '*', // En producción, limitar a tu dominio
    methods: ['GET', 'POST'],
  },
});

// Hacer io accesible en toda la app
app.set('io', io);

// ── Middlewares globales ──────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos subidos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Middleware de logging de peticiones ──────────────────────
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ── Registrar rutas ───────────────────────────────────────────
app.use('/api', statusRoutes);
app.use('/api', messageRoutes);
app.use('/api', campaignRoutes);

// Ruta raíz con info de la API
app.get('/', (req, res) => {
  res.json({
    nombre: 'WhatsApp Bulk API',
    version: '1.0.0',
    estado: 'activo',
    endpoints: {
      estado: 'GET /api/status',
      qr: 'GET /api/qr',
      enviarUno: 'POST /api/send/single',
      enviarMasivo: 'POST /api/send/bulk',
      campañas: 'GET /api/campaigns',
      detalleCampaña: 'GET /api/campaigns/:id',
    },
    websocket: 'Conectar a Socket.IO para progreso en tiempo real',
  });
});

// ── Manejo de rutas no encontradas ───────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Manejo global de errores ──────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    mensaje: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error',
  });
});

// ── Eventos de Socket.IO ──────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`Cliente Socket.IO conectado: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Cliente Socket.IO desconectado: ${socket.id}`);
  });

  // El cliente puede suscribirse a una campaña específica
  socket.on('suscribir_campaña', (campaignId) => {
    socket.join(`campaign_${campaignId}`);
    logger.info(`Socket ${socket.id} suscrito a campaña: ${campaignId}`);
  });
});

// ── Inicializar base de datos y servidor ──────────────────────
async function iniciar() {
  try {
    // 1. Inicializar SQLite
    logger.info('Inicializando base de datos...');
    await initDatabase();

    // 2. Inicializar servicio de WhatsApp
    logger.info('Inicializando servicio de WhatsApp...');
    await whatsappService.inicializar(io);

    // 3. Arrancar servidor HTTP
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
      logger.info(`✅ Servidor corriendo en http://localhost:${PORT}`);
      logger.info(`📡 Socket.IO listo para conexiones en tiempo real`);
      logger.info(`📱 Escanea el QR en GET /api/qr`);
    });

  } catch (error) {
    logger.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// ── Manejo de señales del sistema ────────────────────────────
process.on('SIGTERM', () => {
  logger.info('Señal SIGTERM recibida. Cerrando servidor...');
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info('Señal SIGINT recibida. Cerrando servidor...');
  httpServer.close(() => process.exit(0));
});

// ── Iniciar ───────────────────────────────────────────────────
iniciar();
