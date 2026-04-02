// ============================================================
// CONTROLADOR DE CAMPAÑAS
// ============================================================
const logger = require('../utils/logger');
const { campaignDb, messageDb } = require('../utils/database');
const queueService = require('../services/queue.service');

async function listarCampañas(req, res) {
  try {
    const campañas = await campaignDb.listarTodos();
    const campañasConEstado = campañas.map(c => ({
      ...c,
      procesando_ahora: queueService.estaActiva(c.id),
      porcentaje_completado: c.total_mensajes > 0
        ? Math.round(((c.enviados + c.fallidos) / c.total_mensajes) * 100)
        : 0,
    }));
    return res.json({
      exito: true,
      datos: { total: campañas.length, campañas: campañasConEstado, colas_activas: queueService.obtenerCampañasActivas() },
    });
  } catch (error) {
    logger.error('Error al listar campañas:', error);
    return res.status(500).json({ exito: false, error: 'Error al obtener las campañas' });
  }
}

async function obtenerCampaña(req, res) {
  try {
    const { id } = req.params;
    const campaña = await campaignDb.obtenerPorId(id);
    if (!campaña) return res.status(404).json({ exito: false, error: `Campaña "${id}" no encontrada` });

    const mensajes = await messageDb.listarPorCampaña(id);
    const estadisticas = {
      total: mensajes.length,
      enviados:  mensajes.filter(m => m.estado === 'enviado').length,
      fallidos:  mensajes.filter(m => m.estado === 'fallido').length,
      pendientes: mensajes.filter(m => m.estado === 'pendiente').length,
      porcentaje_completado: mensajes.length > 0
        ? Math.round((mensajes.filter(m => m.estado !== 'pendiente').length / mensajes.length) * 100)
        : 0,
    };

    return res.json({
      exito: true,
      datos: {
        campaña: { ...campaña, procesando_ahora: queueService.estaActiva(id), estadisticas },
        mensajes: mensajes.map(m => ({
          id: m.id,
          telefono: m.telefono,
          texto: m.texto ? m.texto.substring(0, 100) + (m.texto.length > 100 ? '...' : '') : null,
          tipo: m.tipo,
          estado: m.estado,
          error: m.error_detalle,
          intentos: m.intentos,
          creado_en: m.created_at,
          enviado_en: m.enviado_en,
        })),
      },
    });
  } catch (error) {
    logger.error(`Error al obtener campaña ${req.params.id}:`, error);
    return res.status(500).json({ exito: false, error: 'Error al obtener el detalle' });
  }
}

async function cancelarCampaña(req, res) {
  try {
    const { id } = req.params;
    const campaña = await campaignDb.obtenerPorId(id);
    if (!campaña) return res.status(404).json({ exito: false, error: `Campaña "${id}" no encontrada` });
    if (!queueService.estaActiva(id)) return res.status(400).json({ exito: false, error: 'La campaña no está activa' });
    const cancelado = queueService.cancelarCampaña(id);
    return res.json({ exito: cancelado, mensaje: cancelado ? 'Solicitud de cancelación enviada' : 'No se pudo cancelar' });
  } catch (error) {
    logger.error(`Error al cancelar campaña:`, error);
    return res.status(500).json({ exito: false, error: 'Error al cancelar' });
  }
}

async function eliminarCampaña(req, res) {
  try {
    const { id } = req.params;
    const campaña = await campaignDb.obtenerPorId(id);
    if (!campaña) return res.status(404).json({ exito: false, error: `Campaña "${id}" no encontrada` });
    if (queueService.estaActiva(id)) return res.status(400).json({ exito: false, error: 'Cancela la campaña antes de eliminarla' });
    await campaignDb.actualizar(id, { estado: 'eliminada' });
    return res.json({ exito: true, mensaje: 'Campaña eliminada del historial' });
  } catch (error) {
    logger.error(`Error al eliminar campaña:`, error);
    return res.status(500).json({ exito: false, error: 'Error al eliminar' });
  }
}

module.exports = { listarCampañas, obtenerCampaña, cancelarCampaña, eliminarCampaña };
