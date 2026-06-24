const { sequelize, Message, Campaign } = require('../utils/database');
const { Op, fn, col, literal } = require('sequelize');
const logger = require('../utils/logger');

// ── Helpers ──────────────────────────────────────────────────
function startOfDayUTC(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function hace(dias) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ── 1. Mensajes por día (últimos N días) ─────────────────────
async function mensajesPorDia(req, res) {
  try {
    const userId = req.user.id;
    const dias = Math.min(parseInt(req.query.dias) || 5, 90);
    const desde = hace(dias - 1);

    const rows = await Message.findAll({
      attributes: [
        [fn('strftime', '%Y-%m-%d', col('created_at')), 'fecha'],
        [fn('COUNT', col('id')), 'total'],
        [fn('SUM', literal("CASE WHEN estado = 'enviado'  THEN 1 ELSE 0 END")), 'enviados'],
        [fn('SUM', literal("CASE WHEN estado = 'fallido'  THEN 1 ELSE 0 END")), 'fallidos'],
        [fn('SUM', literal("CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END")), 'pendientes'],
      ],
      where: {
        user_id: userId,
        created_at: { [Op.gte]: desde },
      },
      group: [fn('strftime', '%Y-%m-%d', col('created_at'))],
      order: [[fn('strftime', '%Y-%m-%d', col('created_at')), 'ASC']],
      raw: true,
    });

    // Rellenar días sin actividad con ceros
    const mapa = {};
    rows.forEach(r => { mapa[r.fecha] = r; });

    const resultado = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = hace(i);
      const fecha = d.toISOString().slice(0, 10);
      resultado.push(mapa[fecha] || { fecha, total: 0, enviados: 0, fallidos: 0, pendientes: 0 });
    }

    return res.json({
      exito: true,
      datos: {
        periodo_dias: dias,
        desde: desde.toISOString().slice(0, 10),
        hasta: new Date().toISOString().slice(0, 10),
        por_dia: resultado,
        totales: resultado.reduce(
          (acc, r) => ({
            total:     acc.total     + Number(r.total),
            enviados:  acc.enviados  + Number(r.enviados),
            fallidos:  acc.fallidos  + Number(r.fallidos),
            pendientes: acc.pendientes + Number(r.pendientes),
          }),
          { total: 0, enviados: 0, fallidos: 0, pendientes: 0 }
        ),
      },
    });
  } catch (error) {
    logger.error('Error en reporte diario:', error);
    return res.status(500).json({ exito: false, error: 'Error al generar el reporte' });
  }
}

// ── 2. Resumen general de la cuenta ─────────────────────────
async function resumenGeneral(req, res) {
  try {
    const userId = req.user.id;

    const [mensajes, campanas] = await Promise.all([
      Message.findAll({
        attributes: [
          [fn('COUNT', col('id')), 'total'],
          [fn('SUM', literal("CASE WHEN estado = 'enviado'   THEN 1 ELSE 0 END")), 'enviados'],
          [fn('SUM', literal("CASE WHEN estado = 'fallido'   THEN 1 ELSE 0 END")), 'fallidos'],
          [fn('SUM', literal("CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END")), 'pendientes'],
          [fn('SUM', literal("CASE WHEN tipo = 'texto'      THEN 1 ELSE 0 END")), 'tipo_texto'],
          [fn('SUM', literal("CASE WHEN tipo = 'imagen'     THEN 1 ELSE 0 END")), 'tipo_imagen'],
          [fn('SUM', literal("CASE WHEN tipo = 'documento'  THEN 1 ELSE 0 END")), 'tipo_documento'],
        ],
        where: { user_id: userId },
        raw: true,
      }),
      Campaign.findAll({
        attributes: [
          [fn('COUNT', col('id')), 'total'],
          [fn('SUM', literal("CASE WHEN estado = 'completada'             THEN 1 ELSE 0 END")), 'completadas'],
          [fn('SUM', literal("CASE WHEN estado = 'completada_con_errores' THEN 1 ELSE 0 END")), 'con_errores'],
          [fn('SUM', literal("CASE WHEN estado = 'cancelada'              THEN 1 ELSE 0 END")), 'canceladas'],
          [fn('SUM', literal("CASE WHEN estado = 'en_proceso'             THEN 1 ELSE 0 END")), 'en_proceso'],
        ],
        where: { user_id: userId },
        raw: true,
      }),
    ]);

    const m = mensajes[0] || {};
    const c = campanas[0] || {};
    const total = Number(m.total) || 0;
    const enviados = Number(m.enviados) || 0;

    return res.json({
      exito: true,
      datos: {
        mensajes: {
          total,
          enviados,
          fallidos:   Number(m.fallidos)   || 0,
          pendientes: Number(m.pendientes) || 0,
          tasa_exito: total > 0 ? Math.round((enviados / total) * 100) : 0,
          por_tipo: {
            texto:     Number(m.tipo_texto)     || 0,
            imagen:    Number(m.tipo_imagen)    || 0,
            documento: Number(m.tipo_documento) || 0,
          },
        },
        campanas: {
          total:       Number(c.total)       || 0,
          completadas: Number(c.completadas) || 0,
          con_errores: Number(c.con_errores) || 0,
          canceladas:  Number(c.canceladas)  || 0,
          en_proceso:  Number(c.en_proceso)  || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Error en resumen general:', error);
    return res.status(500).json({ exito: false, error: 'Error al generar el reporte' });
  }
}

// ── 3. Top campañas por volumen ───────────────────────────────
async function topCampanas(req, res) {
  try {
    const userId = req.user.id;
    const limite = Math.min(parseInt(req.query.limit) || 10, 50);

    const campanas = await Campaign.findAll({
      where: { user_id: userId },
      order: [['total_mensajes', 'DESC']],
      limit: limite,
      raw: true,
    });

    return res.json({
      exito: true,
      datos: campanas.map((c, i) => ({
        posicion: i + 1,
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        total_mensajes: c.total_mensajes,
        enviados: c.enviados,
        fallidos: c.fallidos,
        tasa_exito: c.total_mensajes > 0
          ? Math.round((c.enviados / c.total_mensajes) * 100)
          : 0,
        completado_en: c.completado_en,
        creado_en: c.created_at,
      })),
    });
  } catch (error) {
    logger.error('Error en top campañas:', error);
    return res.status(500).json({ exito: false, error: 'Error al generar el reporte' });
  }
}

// ── 4. Mensajes fallidos recientes ────────────────────────────
async function mensajesFallidos(req, res) {
  try {
    const userId = req.user.id;
    const dias = Math.min(parseInt(req.query.dias) || 7, 30);
    const limite = Math.min(parseInt(req.query.limit) || 50, 200);

    const rows = await Message.findAll({
      where: {
        user_id: userId,
        estado: 'fallido',
        created_at: { [Op.gte]: hace(dias) },
      },
      order: [['created_at', 'DESC']],
      limit: limite,
      raw: true,
    });

    // Agrupar errores más frecuentes
    const errorCount = {};
    rows.forEach(r => {
      const err = r.error_detalle || 'Error desconocido';
      errorCount[err] = (errorCount[err] || 0) + 1;
    });

    const erroresFrecuentes = Object.entries(errorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([error, cantidad]) => ({ error, cantidad }));

    return res.json({
      exito: true,
      datos: {
        total_fallidos: rows.length,
        periodo_dias: dias,
        errores_frecuentes: erroresFrecuentes,
        mensajes: rows.map(m => ({
          id: m.id,
          telefono: m.telefono,
          tipo: m.tipo,
          error: m.error_detalle,
          intentos: m.intentos,
          campaign_id: m.campaign_id,
          creado_en: m.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error('Error en mensajes fallidos:', error);
    return res.status(500).json({ exito: false, error: 'Error al generar el reporte' });
  }
}

module.exports = { mensajesPorDia, resumenGeneral, topCampanas, mensajesFallidos };
