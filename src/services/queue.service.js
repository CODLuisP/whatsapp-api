// ============================================================
// SERVICIO DE COLA DE MENSAJES
// ============================================================
const logger = require('../utils/logger');
const whatsappService = require('./whatsapp.service');
const { campaignDb, messageDb } = require('../utils/database');

const colasActivas = new Map();

function esperarDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  logger.info(`⏳ Esperando ${delay}ms antes del próximo envío...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function reemplazarVariables(texto, variables) {
  if (!texto || !variables) return texto;
  return texto.replace(/\{(\w+)\}/g, (match, clave) => {
    return variables[clave] !== undefined ? variables[clave] : match;
  });
}

async function procesarCampaña(campaignId, mensajes, opciones = {}) {
  const {
    delay_ms = 3000,
    io = null,
    userId = null,
  } = opciones;

  const delayMin = parseInt(process.env.QUEUE_MIN_DELAY) || 2000;
  const delayMax = parseInt(process.env.QUEUE_MAX_DELAY) || 5000;
  const dMin = Math.min(delay_ms, delayMin);
  const dMax = Math.max(delay_ms, delayMax);

  colasActivas.set(campaignId, { procesando: true, cancelar: false });
  logger.info(`🚀 [Usuario ${userId}] Iniciando campaña ${campaignId} con ${mensajes.length} mensajes`);

  await campaignDb.actualizar(campaignId, userId, { estado: 'en_proceso' });

  emitirProgreso(io, campaignId, {
    evento: 'campaña_iniciada',
    campaign_id: campaignId,
    total: mensajes.length,
    userId
  });

  let enviados = 0;
  let fallidos = 0;

  for (let i = 0; i < mensajes.length; i++) {
    const msgData = mensajes[i];
    const estadoCola = colasActivas.get(campaignId);
    if (estadoCola?.cancelar) {
      logger.info(`⛔ [Usuario ${userId}] Campaña ${campaignId} cancelada`);
      await campaignDb.actualizar(campaignId, userId, {
        estado: 'cancelada',
        enviados,
        fallidos,
        pendientes: mensajes.length - i,
      });
      emitirProgreso(io, campaignId, { evento: 'campaña_cancelada', campaign_id: campaignId, enviados, fallidos, userId });
      break;
    }

    try {
      logger.info(`📨 [Usuario ${userId}] Enviando mensaje ${i + 1}/${mensajes.length} a ${msgData.telefono}`);

      const textoFinal = reemplazarVariables(msgData.texto, msgData.variables);
      await enviarMensaje(userId, msgData.telefono, textoFinal, msgData);

      await messageDb.actualizar(msgData.id, userId, {
        estado: 'enviado',
        enviado_en: new Date(),
        intentos: (msgData.intentos || 0) + 1,
      });

      enviados++;
      await campaignDb.actualizar(campaignId, userId, {
        enviados,
        fallidos,
        pendientes: mensajes.length - enviados - fallidos,
      });

      emitirProgreso(io, campaignId, {
        evento: 'mensaje_enviado',
        campaign_id: campaignId,
        mensaje_id: msgData.id,
        telefono: msgData.telefono,
        userId,
        progreso: {
          actual: i + 1,
          total: mensajes.length,
          enviados,
          fallidos,
          pendientes: mensajes.length - enviados - fallidos,
          porcentaje: Math.round(((i + 1) / mensajes.length) * 100),
        },
      });

    } catch (error) {
      logger.error(`❌ [Usuario ${userId}] Error enviando a ${msgData.telefono}:`, error.message);

      await messageDb.actualizar(msgData.id, userId, {
        estado: 'fallido',
        error_detalle: error.message,
        intentos: (msgData.intentos || 0) + 1,
      });

      fallidos++;
      await campaignDb.actualizar(campaignId, userId, {
        enviados,
        fallidos,
        pendientes: mensajes.length - enviados - fallidos,
      });

      emitirProgreso(io, campaignId, {
        evento: 'mensaje_fallido',
        campaign_id: campaignId,
        mensaje_id: msgData.id,
        telefono: msgData.telefono,
        error: error.message,
        userId,
        progreso: {
          actual: i + 1,
          total: mensajes.length,
          enviados,
          fallidos,
          pendientes: mensajes.length - enviados - fallidos,
          porcentaje: Math.round(((i + 1) / mensajes.length) * 100),
        },
      });
    }

    if (i < mensajes.length - 1) {
      await esperarDelay(dMin, dMax);
    }
  }

  const estadoFinal = fallidos === mensajes.length ? 'error'
    : fallidos > 0 ? 'completada_con_errores'
    : 'completada';

  await campaignDb.actualizar(campaignId, userId, {
    estado: estadoFinal,
    enviados,
    fallidos,
    pendientes: 0,
    completado_en: new Date(),
  });

  colasActivas.delete(campaignId);
  logger.info(`✅ [Usuario ${userId}] Campaña ${campaignId} finalizada. Enviados: ${enviados}, Fallidos: ${fallidos}`);

  emitirProgreso(io, campaignId, {
    evento: 'campaña_completada',
    campaign_id: campaignId,
    userId,
    resumen: { total: mensajes.length, enviados, fallidos, estado: estadoFinal },
  });
}

async function enviarMensaje(userId, telefono, texto, msgData) {
  switch (msgData.tipo) {
    case 'imagen':
      return await whatsappService.enviarImagen(userId, telefono, msgData.archivo_url, texto);
    case 'documento':
      return await whatsappService.enviarDocumento(userId, telefono, msgData.archivo_url, msgData.nombre_archivo || 'documento', msgData.mime_type || 'application/octet-stream', texto || '');
    default:
      return await whatsappService.enviarTexto(userId, telefono, texto);
  }
}

function emitirProgreso(io, campaignId, datos) {
  if (io) {
    io.emit('progreso_campaña', datos);
    io.to(`campaign_${campaignId}`).emit('progreso_campaña', datos);
  }
}

function cancelarCampaña(campaignId) {
  if (colasActivas.has(campaignId)) {
    colasActivas.get(campaignId).cancelar = true;
    return true;
  }
  return false;
}

function estaActiva(campaignId) {
  return colasActivas.has(campaignId);
}

function obtenerCampañasActivas() {
  return Array.from(colasActivas.keys());
}

module.exports = { procesarCampaña, cancelarCampaña, estaActiva, obtenerCampañasActivas, reemplazarVariables };