const { templateDb } = require('../utils/database');
const logger = require('../utils/logger');

async function listarPlantillas(req, res) {
  try {
    const user_id = req.user.id;
    const plantillas = await templateDb.listarTodos(user_id);
    
    // Parse variables de string JSON a Array
    const result = plantillas.map(t => ({
      ...t,
      variables: t.variables ? JSON.parse(t.variables) : []
    }));

    res.json({ exito: true, datos: result });
  } catch (error) {
    logger.error('Error al listar plantillas:', error);
    res.status(500).json({ error: 'Error interno del servidor', mensaje: error.message });
  }
}

async function crearPlantilla(req, res) {
  try {
    const user_id = req.user.id;
    const { name, text, category, variables } = req.body;

    if (!name || !text) {
      return res.status(400).json({ error: 'Nombre y cuerpo de plantilla son requeridos' });
    }

    const id = `tmpl-${Date.now()}`;
    const dbVars = Array.isArray(variables) ? JSON.stringify(variables) : '[]';

    const plantilla = await templateDb.crear({
      id,
      user_id,
      name,
      text,
      category: category || 'marketing',
      variables: dbVars
    });

    res.json({
      exito: true,
      datos: {
        ...plantilla.get({ plain: true }),
        variables: variables || []
      }
    });
  } catch (error) {
    logger.error('Error al crear plantilla:', error);
    res.status(500).json({ error: 'Error interno del servidor', mensaje: error.message });
  }
}

async function eliminarPlantilla(req, res) {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const count = await templateDb.eliminarPorId(id, user_id);
    if (count === 0) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    res.json({ exito: true, mensaje: 'Plantilla eliminada correctamente' });
  } catch (error) {
    logger.error('Error al eliminar plantilla:', error);
    res.status(500).json({ error: 'Error interno del servidor', mensaje: error.message });
  }
}

module.exports = {
  listarPlantillas,
  crearPlantilla,
  eliminarPlantilla
};
