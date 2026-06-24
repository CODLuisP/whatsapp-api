const logger = require('../utils/logger');
const { messageDb } = require('../utils/database');

async function listarMensajes(req, res) {
  try {
    const userId = req.user.id;
    const { estado, tipo, campaign_id, page = 1, limit = 50 } = req.query;

    const { count, rows } = await messageDb.listarTodos(userId, {
      estado, tipo, campaign_id, page, limit,
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    return res.json({
      exito: true,
      datos: {
        total: count,
        pagina: parseInt(page),
        total_paginas: totalPages,
        por_pagina: parseInt(limit),
        mensajes: rows,
      },
    });
  } catch (error) {
    logger.error('Error al listar mensajes:', error);
    return res.status(500).json({ exito: false, error: 'Error al obtener los mensajes' });
  }
}

module.exports = { listarMensajes };
