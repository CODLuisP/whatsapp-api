// ============================================================
// CONTROLADOR DE MENSAJES
// Elimina archivos del servidor automáticamente tras enviarlos
// ============================================================
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');
const logger   = require('../utils/logger');
const whatsappService = require('../services/whatsapp.service');
const queueService    = require('../services/queue.service');
const { campaignDb, messageDb } = require('../utils/database');

/**
 * Eliminar archivo del servidor si existe y es un archivo local subido
 * Solo elimina archivos que estén en la carpeta uploads/ del servidor
 * No intenta eliminar URLs externas (http de otro dominio)
 */
function eliminarArchivoLocal(fileUrl) {
  try {
    if (!fileUrl) return;

    // Solo procesar URLs locales del propio servidor (uploads/)
    const uploadsDir = process.env.UPLOADS_DIR || './uploads';

    // Extraer el nombre del archivo de la URL
    // Ej: "http://localhost:3000/uploads/1711234567-imagen.jpg" → "1711234567-imagen.jpg"
    const nombreArchivo = path.basename(fileUrl);
    const rutaCompleta  = path.join(uploadsDir, nombreArchivo);

    // Verificar que el archivo existe antes de intentar eliminarlo
    if (fs.existsSync(rutaCompleta)) {
      fs.unlinkSync(rutaCompleta);
      logger.info(`🗑️  Archivo eliminado del servidor: ${nombreArchivo}`);
    }
  } catch (err) {
    // No lanzar error si falla la eliminación — el mensaje ya se envió
    logger.warn(`No se pudo eliminar el archivo ${fileUrl}: ${err.message}`);
  }
}

/**
 * POST /api/send/single
 * Enviar mensaje individual — elimina el archivo tras enviarlo
 */
async function enviarMensajeIndividual(req, res) {
  try {
    const userId = req.user.id;
    const { phone, text, type = 'texto', file_url, filename, mime_type } = req.body;

    if (!phone) return res.status(400).json({ exito: false, error: 'El campo "phone" es requerido' });
    if (!text && type === 'texto') return res.status(400).json({ exito: false, error: 'El campo "text" es requerido' });
    if ((type === 'imagen' || type === 'documento') && !file_url) {
      return res.status(400).json({ exito: false, error: 'El campo "file_url" es requerido' });
    }

    // Enviar según tipo
    let resultado;
    switch (type) {
      case 'imagen':
        resultado = await whatsappService.enviarImagen(userId, phone, file_url, text || '');
        break;
      case 'documento':
        resultado = await whatsappService.enviarDocumento(userId, phone, file_url, filename || 'documento', mime_type || 'application/octet-stream', text || '');
        break;
      default:
        resultado = await whatsappService.enviarTexto(userId, phone, text);
    }

    // ── Eliminar archivo del servidor después de enviarlo ─────
    // Solo para mensajes con archivo (imagen o documento)
    if (type === 'imagen' || type === 'documento') {
      eliminarArchivoLocal(file_url);
    }

    // Guardar historial
    const campaignId = uuidv4();
    const messageId  = uuidv4();

    await campaignDb.crear({
      id: campaignId,
      user_id: userId,
      nombre: `Individual - ${phone}`,
      total_mensajes: 1,
      pendientes: 0,
      delay_ms: 0,
    });

    await messageDb.crear({
      id: messageId,
      user_id: userId,
      campaign_id: campaignId,
      telefono: phone,
      texto: text,
      tipo: type,
      archivo_url: file_url || null,
    });

    await messageDb.actualizar(messageId, userId, {
      estado: 'enviado',
      enviado_en: new Date(),
    });

    await campaignDb.actualizar(campaignId, userId, {
      estado: 'completada',
      enviados: 1,
      completado_en: new Date(),
    });

    logger.info(`✅ [Usuario ${userId}] Mensaje individual enviado a ${phone}`);

    return res.json({
      exito: true,
      mensaje: 'Mensaje enviado exitosamente',
      datos: {
        message_id: messageId,
        telefono: phone,
        tipo: type,
        enviado_en: new Date().toISOString(),
      },
    });

  } catch (error) {
    logger.error('Error al enviar mensaje individual:', error);
    const statusCode = error.message.includes('no está conectado') ? 503 : 500;
    return res.status(statusCode).json({ exito: false, error: error.message });
  }
}

/**
 * POST /api/send/bulk
 * Envío masivo — el archivo se elimina al finalizar TODA la campaña
 * porque el mismo archivo se usa para todos los mensajes
 */
async function enviarMensajesMasivos(req, res) {
  try {
    const userId = req.user.id;
    const { campaign_name, messages, delay_ms = 3000 } = req.body;

    if (!campaign_name) return res.status(400).json({ exito: false, error: '"campaign_name" es requerido' });
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ exito: false, error: '"messages" debe ser un array no vacío' });
    }

    const errores = [];
    messages.forEach((msg, i) => {
      if (!msg.phone) errores.push(`Mensaje ${i + 1}: falta "phone"`);
      if (!msg.text && (!msg.type || msg.type === 'texto')) errores.push(`Mensaje ${i + 1}: falta "text"`);
    });
    if (errores.length) return res.status(400).json({ exito: false, error: errores[0], detalles: errores });

    const delayFinal = Math.max(delay_ms, 1000);
    const campaignId = uuidv4();

    await campaignDb.crear({
      id: campaignId,
      user_id: userId,
      nombre: campaign_name,
      total_mensajes: messages.length,
      pendientes: messages.length,
      delay_ms: delayFinal,
    });

    const mensajesPreparados = messages.map((msg) => {
      const { phone, text, type = 'texto', file_url, filename, mime_type, ...variablesExtra } = msg;
      return {
        id: uuidv4(),
        user_id: userId,
        campaign_id: campaignId,
        telefono: phone,
        texto: text,
        tipo: type,
        archivo_url: file_url || null,
        variables: variablesExtra,
        nombre_archivo: filename,
        mime_type,
      };
    });

    await messageDb.crearBatch(mensajesPreparados.map(m => ({
      id: m.id,
      user_id: m.user_id,
      campaign_id: m.campaign_id,
      telefono: m.telefono,
      texto: m.texto,
      tipo: m.tipo,
      archivo_url: m.archivo_url,
    })));

    const io = req.app.get('io');

    // Detectar si hay archivo compartido en la campaña
    // (cuando todos los mensajes usan el mismo file_url)
    const archivosUnicos = [...new Set(
      mensajesPreparados
        .map(m => m.archivo_url)
        .filter(Boolean)
    )];

    setImmediate(async () => {
      try {
        await queueService.procesarCampaña(campaignId, mensajesPreparados, {
          delay_ms: delayFinal,
          io,
          userId
        });

        // ── Eliminar archivos al finalizar toda la campaña ────
        // Se eliminan DESPUÉS de que todos los mensajes se enviaron
        archivosUnicos.forEach(url => {
          eliminarArchivoLocal(url);
        });

      } catch (err) {
        logger.error(`Error fatal en campaña ${campaignId}:`, err);
        // Intentar eliminar archivos aunque haya error
        archivosUnicos.forEach(url => eliminarArchivoLocal(url));
      }
    });

    logger.info(`📢 [Usuario ${userId}] Campaña "${campaign_name}" creada con ${messages.length} mensajes`);

    return res.status(202).json({
      exito: true,
      mensaje: 'Campaña creada y en cola de procesamiento',
      datos: {
        campaign_id: campaignId,
        nombre: campaign_name,
        total_mensajes: messages.length,
        delay_ms: delayFinal,
        estado: 'pendiente',
        progreso_url: `/api/campaigns/${campaignId}`,
      },
    });

  } catch (error) {
    logger.error('Error al crear envío masivo:', error);
    const statusCode = error.message.includes('no está conectado') ? 503 : 500;
    return res.status(statusCode).json({ exito: false, error: error.message });
  }
}

module.exports = { enviarMensajeIndividual, enviarMensajesMasivos };