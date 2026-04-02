// ============================================================
// MIDDLEWARE DE AUTENTICACIÓN (opcional)
// Protege los endpoints con una API Key simple
// ============================================================
const logger = require('../utils/logger');

/**
 * Middleware para verificar API Key en las peticiones
 * Activar agregando API_KEY en el .env y aplicando este middleware
 * a las rutas que quieras proteger
 *
 * Uso: router.post('/send/bulk', verificarApiKey, controlador)
 */
function verificarApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;

  // Si no hay API_KEY configurada, saltar la verificación
  if (!apiKey) {
    return next();
  }

  // Buscar la clave en el header Authorization o x-api-key
  const keyRecibida =
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace('Bearer ', '');

  if (!keyRecibida) {
    logger.warn(`Acceso denegado a ${req.path} - Sin API Key`);
    return res.status(401).json({
      exito: false,
      error: 'Se requiere API Key. Envía el header "x-api-key" o "Authorization: Bearer <key>"',
    });
  }

  if (keyRecibida !== apiKey) {
    logger.warn(`Acceso denegado a ${req.path} - API Key inválida`);
    return res.status(403).json({
      exito: false,
      error: 'API Key inválida',
    });
  }

  next();
}

module.exports = { verificarApiKey };
