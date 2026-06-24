const express = require('express');
const router = express.Router();
const { mensajesPorDia, resumenGeneral, topCampanas, mensajesFallidos } = require('../controllers/report.controller');

// GET /api/reports/daily      → Mensajes por día (últimos N días)
router.get('/reports/daily', mensajesPorDia);

// GET /api/reports/summary    → Resumen general de la cuenta
router.get('/reports/summary', resumenGeneral);

// GET /api/reports/top-campaigns → Top campañas por volumen
router.get('/reports/top-campaigns', topCampanas);

// GET /api/reports/failed     → Mensajes fallidos recientes
router.get('/reports/failed', mensajesFallidos);

module.exports = router;
