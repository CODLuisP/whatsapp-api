// ============================================================
// CONTROLADOR DE ESTADO
// Maneja los endpoints de estado y QR de WhatsApp
// ============================================================
const whatsappService = require('../services/whatsapp.service');
const logger = require('../utils/logger');

/**
 * GET /api/status
 * Retorna el estado actual de la conexión de WhatsApp
 */
async function obtenerEstado(req, res) {
  try {
    const userId = req.user.id;
    const estado = whatsappService.obtenerEstado(userId);

    return res.json({
      exito: true,
      datos: {
        ...estado,
        // Mapear estados a mensajes amigables
        mensaje: {
          desconectado: '❌ No conectado - Escanea el QR',
          conectando: '⏳ Conectando...',
          qr: '📱 Esperando escaneo del QR',
          conectado: '✅ Conectado y listo',
          error: '🚫 Error de conexión',
        }[estado.estado] || 'Estado desconocido',
      },
    });
  } catch (error) {
    logger.error('Error al obtener estado:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error al obtener el estado de WhatsApp',
    });
  }
}

/**
 * GET /api/qr
 * Retorna el QR actual en base64 para mostrarlo en el frontend
 */
async function obtenerQR(req, res) {
  try {
    const userId = req.user.id;
    const qr = await whatsappService.obtenerQR(userId);
    const estado = whatsappService.obtenerEstado(userId);

    if (estado.estado === 'conectado') {
      return res.json({
        exito: true,
        datos: {
          estado: 'conectado',
          mensaje: 'Ya estás conectado, no necesitas escanear el QR',
          qr: null,
        },
      });
    }

    if (!qr) {
      return res.json({
        exito: false,
        datos: {
          estado: estado.estado,
          mensaje: 'QR no disponible todavía. Espera unos segundos e intenta de nuevo.',
          qr: null,
        },
      });
    }

    return res.json({
      exito: true,
      datos: {
        estado: 'qr_disponible',
        mensaje: 'Escanea este QR con WhatsApp para conectar',
        qr, // Imagen en base64 lista para mostrar en <img src="">
      },
    });
  } catch (error) {
    logger.error('Error al obtener QR:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error al obtener el QR',
    });
  }
}

/**
 * POST /api/disconnect
 * Desconectar WhatsApp (cerrar sesión)
 */
async function desconectar(req, res) {
  try {
    const userId = req.user.id;
    await whatsappService.desconectar(userId);
    return res.json({
      exito: true,
      mensaje: 'WhatsApp desconectado exitosamente',
    });
  } catch (error) {
    logger.error('Error al desconectar:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error al desconectar WhatsApp',
    });
  }
}

module.exports = { obtenerEstado, obtenerQR, desconectar };
