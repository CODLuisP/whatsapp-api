const express = require('express');
const router = express.Router();
const { crearUsuario, listarUsuarios } = require('../controllers/user.controller');

// GET /api/users
router.get('/', listarUsuarios);

// POST /api/users/register
router.post('/register', crearUsuario);

module.exports = router;
