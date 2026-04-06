// ============================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================================
const logger = require('../utils/logger');
const { userDb } = require('../utils/database');

/**
 * Middleware para verificar la API Key del usuario
 */
async function verificarApiKey(req, res, next) {
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

  try {
    const user = await userDb.obtenerPorApiKey(keyRecibida);
    if (!user) {
      logger.warn(`Acceso denegado a ${req.path} - API Key inválida`);
      return res.status(403).json({
        exito: false,
        error: 'API Key inválida',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Error en autenticación:', error);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
}

module.exports = { verificarApiKey };
