// ============================================================
// SERVICIO DE WHATSAPP - Núcleo de Baileys MULTIUSUARIO
// Maneja la conexión, autenticación y envío de mensajes
// ============================================================
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidNormalizedUser,
  proto,
  getContentType,
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const logger = require('../utils/logger');

// ── Configuración ─────────────────────────────────────────────
const BASE_SESSION_DIR = process.env.SESSION_DIR || './sessions';

// ── Estado global del servicio ────────────────────────────────
// Mapa que almacenará las sesiones activas por userId
// sessions.get(userId) = { socket, qrBase64, estadoConexion, intentosReconexion }
const sessions = new Map();

let ioInstance = null;      // Referencia a Socket.IO
const MAX_INTENTOS = 5;

/**
 * Emitir evento a todos los clientes Socket.IO conectados (opcionalmente filtrado por usuario)
 */
function emitir(userId, evento, datos) {
  if (ioInstance) {
    // Si quisieras aislar sockets por usuario, tendrías que usar ioInstance.to(userId)
    // Para simplificar, emitimos globalmente, pero enviando el userId para que el cliente lo filtre
    ioInstance.emit(evento, { ...datos, userId });
  }
}

/**
 * Inicializar la referencia a Socket.IO
 */
async function inicializar(io) {
  ioInstance = io;
  logger.info('Servicio multiusuario de WhatsApp inicializado (esperando conexiones de usuarios)');
}

/**
 * Obtener o inicializar sesión para un usuario
 */
function obtenerSesion(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      socket: null,
      qrBase64: null,
      estadoConexion: 'desconectado',
      intentosReconexion: 0
    });
  }
  return sessions.get(userId);
}

/**
 * Conectar o reconectar a WhatsApp para un usuario
 */
async function conectar(userId) {
  const sesion = obtenerSesion(userId);
  try {
    sesion.estadoConexion = 'conectando';
    logger.info(`[Usuario ${userId}] Iniciando conexión con WhatsApp...`);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    // Directorio individual por usuario
    const userSessionDir = path.join(BASE_SESSION_DIR, userId);
    if (!fs.existsSync(userSessionDir)) {
      fs.mkdirSync(userSessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(userSessionDir);

    sesion.socket = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
    });

    sesion.socket.ev.on('creds.update', saveCreds);

    sesion.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sesion.intentosReconexion = 0;
        sesion.estadoConexion = 'qr';
        logger.info(`[Usuario ${userId}] Nuevo QR generado.`);

        try {
          sesion.qrBase64 = await QRCode.toDataURL(qr);
          emitir(userId, 'qr_actualizado', { qr: sesion.qrBase64 });
        } catch (err) {
          logger.error(`[Usuario ${userId}] Error generando QR en base64:`, err);
        }
      }

      if (connection === 'close') {
        sesion.qrBase64 = null;
        sesion.estadoConexion = 'desconectado';

        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : 500;

        logger.warn(`[Usuario ${userId}] Conexión cerrada. Código: ${statusCode}`);

        const debeReconectar = statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.badSession;

        if (debeReconectar && sesion.intentosReconexion < MAX_INTENTOS) {
          sesion.intentosReconexion++;
          const delay = Math.min(1000 * Math.pow(2, sesion.intentosReconexion), 30000);
          logger.info(`[Usuario ${userId}] Reconectando en ${delay / 1000}s... (intento ${sesion.intentosReconexion}/${MAX_INTENTOS})`);
          emitir(userId, 'estado_conexion', { estado: 'reconectando', intento: sesion.intentosReconexion });
          setTimeout(() => conectar(userId), delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          logger.warn(`[Usuario ${userId}] Sesión cerrada. Limpiando archivos...`);
          limpiarSesion(userId);
          setTimeout(() => conectar(userId), 2000);
        } else {
          logger.error(`[Usuario ${userId}] No se puede reconectar. Intenta reescanear el QR.`);
          emitir(userId, 'estado_conexion', { estado: 'error', mensaje: 'No se puede reconectar' });
        }
      }

      if (connection === 'open') {
        sesion.intentosReconexion = 0;
        sesion.estadoConexion = 'conectado';
        sesion.qrBase64 = null;
        const user = sesion.socket.user;
        logger.info(`[Usuario ${userId}] ✅ Conectado como: ${user?.name || 'Desconocido'} (${user?.id})`);
        emitir(userId, 'estado_conexion', {
          estado: 'conectado',
          usuario: user?.name,
          numero: user?.id,
        });
      }

      if (connection === 'connecting') {
        sesion.estadoConexion = 'conectando';
        emitir(userId, 'estado_conexion', { estado: 'conectando' });
      }
    });

    sesion.socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type === 'notify') {
        messages.forEach(msg => {
          if (!msg.key.fromMe) {
            logger.info(`[Usuario ${userId}] Mensaje recibido de ${msg.key.remoteJid}`);
          }
        });
      }
    });

  } catch (error) {
    logger.error(`[Usuario ${userId}] Error crítico al conectar:`, error);
    sesion.estadoConexion = 'error';
    emitir(userId, 'estado_conexion', { estado: 'error', mensaje: error.message });
    throw error;
  }
}

/**
 * Limpiar archivos de sesión guardados
 */
function limpiarSesion(userId) {
  try {
    const userSessionDir = path.join(BASE_SESSION_DIR, userId);
    if (fs.existsSync(userSessionDir)) {
      fs.readdirSync(userSessionDir).forEach(archivo => {
        fs.unlinkSync(path.join(userSessionDir, archivo));
      });
      logger.info(`[Usuario ${userId}] Archivos de sesión eliminados`);
    }
  } catch (err) {
    logger.error(`[Usuario ${userId}] Error al limpiar sesión:`, err);
  }
}

/**
 * Verificar que el socket esté conectado para un usuario
 */
function verificarConexion(userId) {
  const sesion = obtenerSesion(userId);
  if (!sesion.socket || sesion.estadoConexion !== 'conectado') {
    throw new Error(`WhatsApp no está conectado para el usuario ${userId}. Escanea el QR primero.`);
  }
  return sesion.socket;
}

/**
 * Normalizar número de teléfono al formato JID de WhatsApp
 */
function normalizarTelefono(telefono) {
  const numero = String(telefono).replace(/\D/g, '');
  return `${numero}@s.whatsapp.net`;
}

/**
 * Verificar si un número existe en WhatsApp
 */
async function verificarNumero(userId, telefono) {
  try {
    const socket = verificarConexion(userId);
    const jid = normalizarTelefono(telefono);
    const [resultado] = await socket.onWhatsApp(jid);
    return resultado?.exists || false;
  } catch (error) {
    logger.error(`[Usuario ${userId}] Error al verificar número ${telefono}:`, error);
    return false;
  }
}

/**
 * Enviar mensaje de texto simple
 */
async function enviarTexto(userId, telefono, texto) {
  const socket = verificarConexion(userId);
  const jid = normalizarTelefono(telefono);

  const resultado = await socket.sendMessage(jid, { text: texto });
  logger.info(`[Usuario ${userId}] ✉️ Texto enviado a ${telefono}`);
  return resultado;
}

/**
 * Enviar imagen con caption opcional
 */
async function enviarImagen(userId, telefono, rutaImagen, caption = '') {
  const socket = verificarConexion(userId);
  const jid = normalizarTelefono(telefono);

  let imagen;
  if (rutaImagen.startsWith('http')) {
    imagen = { url: rutaImagen };
  } else {
    imagen = fs.readFileSync(rutaImagen);
  }

  const resultado = await socket.sendMessage(jid, {
    image: imagen,
    caption,
  });

  logger.info(`[Usuario ${userId}] 🖼️ Imagen enviada a ${telefono}`);
  return resultado;
}

/**
 * Enviar documento/archivo
 */
async function enviarDocumento(userId, telefono, rutaArchivo, nombreArchivo, mimeType = 'application/octet-stream', caption = '') {
  const socket = verificarConexion(userId);
  const jid = normalizarTelefono(telefono);

  let documento;
  if (rutaArchivo.startsWith('http')) {
    documento = { url: rutaArchivo };
  } else {
    documento = fs.readFileSync(rutaArchivo);
  }

  const resultado = await socket.sendMessage(jid, {
    document: documento,
    fileName: nombreArchivo,
    mimetype: mimeType,
    caption: caption || undefined,
  });

  logger.info(`[Usuario ${userId}] 📄 Documento enviado a ${telefono}`);
  return resultado;
}

/**
 * Obtener el estado actual de la conexión de un usuario
 */
function obtenerEstado(userId) {
  const sesion = obtenerSesion(userId);
  return {
    estado: sesion.estadoConexion,
    usuario: sesion.socket?.user?.name || null,
    numero: sesion.socket?.user?.id || null,
    tieneQR: !!sesion.qrBase64,
  };
}

/**
 * Obtener el QR actual en base64 de un usuario
 */
async function obtenerQR(userId) {
  const sesion = obtenerSesion(userId);
  // Si no está conectado y no hay QR, intentamos conectar/reconectar
  if (sesion.estadoConexion === 'desconectado' && !sesion.qrBase64) {
    await conectar(userId);
  }
  return sesion.qrBase64;
}

/**
 * Cerrar la conexión con WhatsApp de un usuario
 */
async function desconectar(userId) {
  const sesion = obtenerSesion(userId);
  if (sesion.socket) {
    await sesion.socket.logout();
    sesion.socket = null;
    sesion.estadoConexion = 'desconectado';
    sesion.qrBase64 = null;
    logger.info(`[Usuario ${userId}] WhatsApp desconectado manualmente`);
  }
}

module.exports = {
  inicializar,
  enviarTexto,
  enviarImagen,
  enviarDocumento,
  verificarNumero,
  obtenerEstado,
  obtenerQR,
  desconectar,
  normalizarTelefono,
};