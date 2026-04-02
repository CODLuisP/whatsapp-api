// ============================================================
// UTILIDAD DE LOGGING
// Usa pino para logs estructurados con rotación de archivos
// ============================================================
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logDir = process.env.LOG_DIR || './logs';

// Asegurar que el directorio de logs exista
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configurar logger según entorno
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
}, process.env.NODE_ENV === 'production'
  ? pino.destination(path.join(logDir, 'app.log'))
  : undefined
);

module.exports = logger;
