// ============================================================
// RUTAS DE ESTADO Y QR
// ============================================================
const express = require('express');
const router = express.Router();
const { obtenerEstado, obtenerQR, desconectar } = require('../controllers/status.controller');

// GET /api/status → Estado de la conexión
router.get('/status', obtenerEstado);

// GET /api/qr → Código QR en base64
router.get('/qr', obtenerQR);

// POST /api/disconnect → Cerrar sesión
router.post('/disconnect', desconectar);

module.exports = router;
