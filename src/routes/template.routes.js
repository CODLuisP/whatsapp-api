const express = require('express');
const router = express.Router();
const { crearPlantilla, listarPlantillas, eliminarPlantilla } = require('../controllers/template.controller');

// GET /api/templates
router.get('/templates', listarPlantillas);

// POST /api/templates
router.post('/templates', crearPlantilla);

// DELETE /api/templates/:id
router.delete('/templates/:id', eliminarPlantilla);

module.exports = router;
