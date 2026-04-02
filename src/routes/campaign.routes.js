// ============================================================
// RUTAS DE CAMPAÑAS
// ============================================================
const express = require('express');
const router = express.Router();
const {
  listarCampañas,
  obtenerCampaña,
  cancelarCampaña,
  eliminarCampaña,
} = require('../controllers/campaign.controller');

// GET /api/campaigns → Listar todas las campañas
router.get('/campaigns', listarCampañas);

// GET /api/campaigns/:id → Detalle de una campaña
router.get('/campaigns/:id', obtenerCampaña);

// POST /api/campaigns/:id/cancel → Cancelar campaña activa
router.post('/campaigns/:id/cancel', cancelarCampaña);

// DELETE /api/campaigns/:id → Eliminar del historial
router.delete('/campaigns/:id', eliminarCampaña);

module.exports = router;
