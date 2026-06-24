const express = require('express');
const router = express.Router();
const { listarMensajes } = require('../controllers/messages-list.controller');

// GET /api/messages
router.get('/messages', listarMensajes);

module.exports = router;
