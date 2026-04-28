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
      intentosReconexion: 0,
      readyPromise: null,
      resolveReady: null,
    });
  }
  return sessions.get(userId);
}

/**
 * Restaurar todas las sesiones guardadas en el disco al iniciar el servidor
 */
async function restaurarSesiones() {
  try {
    if (!fs.existsSync(BASE_SESSION_DIR)) return;
    
    const folders = fs.readdirSync(BASE_SESSION_DIR);
    logger.info(`🔍 Restaurando ${folders.length} sesiones encontradas en disco...`);
    
    for (const userId of folders) {
      const userPath = path.join(BASE_SESSION_DIR, userId);
      if (fs.lstatSync(userPath).isDirectory()) {
        // Solo restaurar si hay archivos de credenciales
        if (fs.existsSync(path.join(userPath, 'creds.json'))) {
          logger.info(`[Usuario ${userId}] Auto-conectando...`);
          conectar(userId).catch(err => logger.error(`Error auto-conectando ${userId}:`, err));
        }
      }
    }
  } catch (err) {
    logger.error('Error al restaurar sesiones:', err);
  }
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

    // Crear promesa de "listo" si no existe o si ya fue resuelta
    if (!sesion.readyPromise || !sesion.resolveReady) {
      sesion.readyPromise = new Promise((resolve) => {
        sesion.resolveReady = resolve;
      });
    }

    sesion.socket = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
      printQRInTerminal: false,
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
          sesion.estadoConexion = 'reconectando';
          
          if (!sesion.resolveReady) {
            sesion.readyPromise = new Promise((resolve) => {
              sesion.resolveReady = resolve;
            });
          }

          const delay = Math.min(1000 * Math.pow(2, sesion.intentosReconexion), 30000);
          logger.info(`[Usuario ${userId}] Reconectando en ${delay / 1000}s... (intento ${sesion.intentosReconexion}/${MAX_INTENTOS})`);
          emitir(userId, 'estado_conexion', { estado: 'reconectando', intento: sesion.intentosReconexion });
          setTimeout(() => conectar(userId), delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          logger.warn(`[Usuario ${userId}] Sesión cerrada. Limpiando archivos...`);
          if (sesion.resolveReady) {
            sesion.resolveReady(false);
            sesion.resolveReady = null;
          }
          limpiarSesion(userId);
          setTimeout(() => conectar(userId), 2000);
        } else {
          logger.error(`[Usuario ${userId}] No se puede reconectar. Intenta reescanear el QR.`);
          if (sesion.resolveReady) {
            sesion.resolveReady(false);
            sesion.resolveReady = null;
          }
          emitir(userId, 'estado_conexion', { estado: 'error', mensaje: 'No se puede reconectar' });
        }
      }

      if (connection === 'open') {
        sesion.intentosReconexion = 0;
        sesion.estadoConexion = 'conectado';
        sesion.qrBase64 = null;
        const user = sesion.socket.user;
        logger.info(`[Usuario ${userId}] ✅ Conectado como: ${user?.name || 'Desconocido'} (${user?.id})`);
        
        // "Calentar" la conexión y marcar como disponible
        await sesion.socket.sendPresenceUpdate('available');
        
        // Dar un pequeño margen para sincronización interna
        setTimeout(() => {
          if (sesion.resolveReady) {
            sesion.resolveReady(true);
            sesion.resolveReady = null;
          }
        }, 2000);

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
    if (sesion.resolveReady) {
      sesion.resolveReady(false);
      sesion.resolveReady = null;
    }
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
 * Si no está conectado pero existe sesión, intenta conectar automáticamente
 */
async function verificarConexion(userId) {
  const sesion = obtenerSesion(userId);
  const userSessionDir = path.join(BASE_SESSION_DIR, userId);
  const hasSessionFiles = fs.existsSync(path.join(userSessionDir, 'creds.json'));

  // Si no hay socket o está desconectado, pero hay archivos, intentar reconectar
  if ((!sesion.socket || sesion.estadoConexion === 'desconectado' || sesion.estadoConexion === 'error') && hasSessionFiles) {
    logger.info(`[Usuario ${userId}] Detectada sesión inactiva o desconectada. Auto-conectando antes de enviar...`);
    await conectar(userId);
  }

  // Si está conectando, esperar a que esté listo
  if (sesion.estadoConexion === 'conectando' || sesion.estadoConexion === 'qr' || sesion.estadoConexion === 'reconectando') {
    logger.info(`[Usuario ${userId}] Esperando a que la conexión esté lista (Estado: ${sesion.estadoConexion})...`);
    if (sesion.readyPromise) {
      await sesion.readyPromise;
    }
  }

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
    const socket = await verificarConexion(userId);
    const jid = normalizarTelefono(telefono);
    const [resultado] = await socket.onWhatsApp(jid);
    return resultado?.exists || false;
  } catch (error) {
    logger.error(`[Usuario ${userId}] Error al verificar número ${telefono}:`, error);
    return false;
  }
}

/**
 * Enviar mensaje de texto simple con reintentos
 */
async function enviarTexto(userId, telefono, texto, intentos = 0) {
  try {
    const socket = await verificarConexion(userId);
    const jid = normalizarTelefono(telefono);

    const resultado = await socket.sendMessage(jid, { text: texto });
    logger.info(`[Usuario ${userId}] ✉️ Texto enviado a ${telefono}`);
    return resultado;
  } catch (error) {
    if (intentos < 1) {
      logger.warn(`[Usuario ${userId}] Reintentando envío de texto a ${telefono}...`);
      await new Promise(r => setTimeout(r, 1000));
      return enviarTexto(userId, telefono, texto, intentos + 1);
    }
    throw error;
  }
}

/**
 * Enviar imagen con caption opcional con reintentos
 */
async function enviarImagen(userId, telefono, rutaImagen, caption = '', intentos = 0) {
  try {
    const socket = await verificarConexion(userId);
    const jid = normalizarTelefono(telefono);

    let imagen;
    if (rutaImagen.startsWith('http')) {
      const nombreArchivo = path.basename(rutaImagen);
      const uploadsDir = process.env.UPLOADS_DIR || './uploads';
      const rutaLocal = path.join(uploadsDir, nombreArchivo);
      imagen = fs.readFileSync(rutaLocal);
    } else {
      imagen = fs.readFileSync(rutaImagen);
    }

    const resultado = await socket.sendMessage(jid, {
      image: imagen,
      caption,
    });

    logger.info(`[Usuario ${userId}] 🖼️ Imagen enviada a ${telefono}`);
    return resultado;
  } catch (error) {
    if (intentos < 1) {
      logger.warn(`[Usuario ${userId}] Reintentando envío de imagen a ${telefono}...`);
      await new Promise(r => setTimeout(r, 1000));
      return enviarImagen(userId, telefono, rutaImagen, caption, intentos + 1);
    }
    throw error;
  }
}

/**
 * Enviar documento/archivo con reintentos
 */
async function enviarDocumento(userId, telefono, rutaArchivo, nombreArchivo, mimeType = 'application/octet-stream', caption = '', intentos = 0) {
  try {
    const socket = await verificarConexion(userId);
    const jid = normalizarTelefono(telefono);

    let documento;
    if (rutaArchivo.startsWith('http')) {
      const nombreArchivoLocal = path.basename(rutaArchivo);
      const uploadsDir = process.env.UPLOADS_DIR || './uploads';
      const rutaLocal = path.join(uploadsDir, nombreArchivoLocal);
      documento = fs.readFileSync(rutaLocal);
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
  } catch (error) {
    if (intentos < 1) {
      logger.warn(`[Usuario ${userId}] Reintentando envío de documento a ${telefono}...`);
      await new Promise(r => setTimeout(r, 1000));
      return enviarDocumento(userId, telefono, rutaArchivo, nombreArchivo, mimeType, caption, intentos + 1);
    }
    throw error;
  }
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
  restaurarSesiones,
  enviarTexto,
  enviarImagen,
  enviarDocumento,
  verificarNumero,
  obtenerEstado,
  obtenerQR,
  desconectar,
  normalizarTelefono,
};