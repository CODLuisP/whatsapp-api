const { v4: uuidv4 } = require('uuid');
const { userDb } = require('../utils/database');
const logger = require('../utils/logger');

const crearUsuario = async (req, res) => {
  try {
    const { nombre } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es requerido.' });
    }

    const userId = uuidv4();
    const apiKey = uuidv4();

    const newUser = await userDb.crear({
      id: userId,
      nombre,
      api_key: apiKey
    });

    res.status(201).json({
      exito: true,
      mensaje: 'Usuario creado exitosamente.',
      datos: {
        id: newUser.id,
        nombre: newUser.nombre,
        api_key: newUser.api_key
      }
    });

  } catch (error) {
    logger.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error interno al crear usuario.' });
  }
};

const listarUsuarios = async (req, res) => {
  try {
    const usuarios = await userDb.listarTodos();
    res.json({
      exito: true,
      datos: usuarios.map(u => ({
        id: u.id,
        nombre: u.nombre,
        api_key: u.api_key
      }))
    });
  } catch (error) {
    logger.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error interno al listar usuarios.' });
  }
};

module.exports = { crearUsuario, listarUsuarios };
