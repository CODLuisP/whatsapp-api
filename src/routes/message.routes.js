// ============================================================
// RUTAS DE MENSAJES
// ============================================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { enviarMensajeIndividual, enviarMensajesMasivos } = require('../controllers/message.controller');

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer v2: storage separado del límite
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    // Preservar extensión original con nombre único
    const ext    = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Aceptar imágenes, PDFs, Office, video, audio
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4','video/mpeg',
      'audio/mpeg','audio/ogg','audio/wav',
      'application/zip','application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  },
});

// POST /api/send/single
router.post('/send/single', enviarMensajeIndividual);

// POST /api/send/bulk
router.post('/send/bulk', enviarMensajesMasivos);

// POST /api/upload — subir archivo y obtener URL
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        exito: false,
        error: err.code === 'LIMIT_FILE_SIZE'
          ? `Archivo demasiado grande (máx ${process.env.MAX_FILE_SIZE_MB || 50}MB)`
          : err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({ exito: false, error: 'No se recibió ningún archivo' });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    res.json({
      exito: true,
      datos: {
        filename:     req.file.filename,
        originalname: req.file.originalname,
        mimetype:     req.file.mimetype,
        size:         req.file.size,
        url:          fileUrl,
      },
    });
  });
});

module.exports = router;
