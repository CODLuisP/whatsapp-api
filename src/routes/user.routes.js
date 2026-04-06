const express = require('express');
const router = express.Router();
const { crearUsuario, listarUsuarios, eliminarUsuario } = require('../controllers/user.controller');

// GET /api/users
router.get('/', listarUsuarios);

// POST /api/users/register
router.post('/register', crearUsuario);

// DELETE /api/users/:id
router.delete('/:id', eliminarUsuario);

module.exports = router;
