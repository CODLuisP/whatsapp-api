// ============================================================
// SERVICIO DE WHATSAPP - Núcleo de Baileys
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
const SESSION_DIR = process.env.SESSION_DIR || './sessions';

// ── Estado global del servicio ────────────────────────────────
let socket = null;          // Socket de Baileys
let qrBase64 = null;        // QR actual en base64
let estadoConexion = 'desconectado'; // desconectado | conectando | qr | conectado
let ioInstance = null;      // Referencia a Socket.IO
let intentosReconexion = 0;
const MAX_INTENTOS = 5;

/**
 * Emitir evento a todos los clientes Socket.IO conectados
 */
function emitir(evento, datos) {
  if (ioInstance) {
    ioInstance.emit(evento, datos);
  }
}

/**
 * Inicializar la conexión con WhatsApp
 * @param {Object} io - Instancia de Socket.IO
 */
async function inicializar(io) {
  ioInstance = io;
  await conectar();
}

/**
 * Conectar o reconectar a WhatsApp
 */
async function conectar() {
  try {
    estadoConexion = 'conectando';
    logger.info('Iniciando conexión con WhatsApp...');

    // Obtener la versión más reciente de WhatsApp Web
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Usando Baileys versión WA: ${version.join('.')} - ¿Es la más reciente? ${isLatest}`);

    // Cargar o crear credenciales de sesión desde archivos
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    // Crear socket de WhatsApp con configuración optimizada
    socket = makeWASocket({
      version,
      auth: state,
      // Logger silencioso para no saturar la consola (usamos el nuestro)
      logger: pino({ level: 'silent' }),
      // Configuración para evitar bloqueos
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      // Tiempo de espera para conexión
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
    });

    // ── Evento: Actualización de credenciales ──────────────────
    // Se dispara cuando hay nuevas credenciales que guardar
    socket.ev.on('creds.update', saveCreds);

    // ── Evento: Cambio de estado de conexión ──────────────────
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Si hay un nuevo QR para escanear
      if (qr) {
        intentosReconexion = 0;
        estadoConexion = 'qr';
        logger.info('📱 Nuevo QR generado - Escanea con WhatsApp');

        // Convertir QR a base64 para enviarlo al frontend
        try {
          qrBase64 = await QRCode.toDataURL(qr);
          // Notificar a clientes conectados por Socket.IO
          emitir('qr_actualizado', { qr: qrBase64 });
          logger.info('QR disponible en GET /api/qr');
        } catch (err) {
          logger.error('Error al generar QR en base64:', err);
        }
      }

      // Cambio de estado de la conexión
      if (connection === 'close') {
        qrBase64 = null;
        estadoConexion = 'desconectado';

        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : 500;

        const razon = DisconnectReason;
        logger.warn(`Conexión cerrada. Código: ${statusCode}`);

        // Decidir si reconectar según el motivo de desconexión
        const debeReconectar =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.badSession;

        if (debeReconectar && intentosReconexion < MAX_INTENTOS) {
          intentosReconexion++;
          const delay = Math.min(1000 * Math.pow(2, intentosReconexion), 30000);
          logger.info(`Reconectando en ${delay / 1000}s... (intento ${intentosReconexion}/${MAX_INTENTOS})`);

          emitir('estado_conexion', { estado: 'reconectando', intento: intentosReconexion });

          setTimeout(() => conectar(), delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          // Sesión cerrada - limpiar archivos de sesión
          logger.warn('Sesión cerrada por el usuario. Limpiando archivos de sesión...');
          limpiarSesion();
          // Reiniciar para mostrar nuevo QR
          setTimeout(() => conectar(), 2000);
        } else {
          logger.error('No se puede reconectar. Revisa la configuración.');
          emitir('estado_conexion', { estado: 'error', mensaje: 'No se puede reconectar' });
        }
      }

      if (connection === 'open') {
        intentosReconexion = 0;
        estadoConexion = 'conectado';
        qrBase64 = null;
        const user = socket.user;
        logger.info(`✅ WhatsApp conectado como: ${user?.name || 'Desconocido'} (${user?.id})`);
        emitir('estado_conexion', {
          estado: 'conectado',
          usuario: user?.name,
          numero: user?.id,
        });
      }

      if (connection === 'connecting') {
        estadoConexion = 'conectando';
        emitir('estado_conexion', { estado: 'conectando' });
      }
    });

    // ── Evento: Mensajes recibidos (opcional, para logging) ───
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type === 'notify') {
        messages.forEach(msg => {
          if (!msg.key.fromMe) {
            logger.info(`Mensaje recibido de: ${msg.key.remoteJid}`);
          }
        });
      }
    });

  } catch (error) {
    logger.error('Error crítico al conectar con WhatsApp:', error);
    estadoConexion = 'error';
    emitir('estado_conexion', { estado: 'error', mensaje: error.message });
    throw error;
  }
}

/**
 * Limpiar archivos de sesión guardados
 */
function limpiarSesion() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.readdirSync(SESSION_DIR).forEach(archivo => {
        fs.unlinkSync(path.join(SESSION_DIR, archivo));
      });
      logger.info('Archivos de sesión eliminados');
    }
  } catch (err) {
    logger.error('Error al limpiar sesión:', err);
  }
}

/**
 * Verificar que el socket esté conectado
 */
function verificarConexion() {
  if (!socket || estadoConexion !== 'conectado') {
    throw new Error('WhatsApp no está conectado. Escanea el QR primero.');
  }
}

/**
 * Normalizar número de teléfono al formato JID de WhatsApp
 * @param {string|number} telefono - Número con código de país
 * @returns {string} JID de WhatsApp (ej: 51987654321@s.whatsapp.net)
 */
function normalizarTelefono(telefono) {
  // Remover caracteres no numéricos
  const numero = String(telefono).replace(/\D/g, '');
  return `${numero}@s.whatsapp.net`;
}

/**
 * Verificar si un número existe en WhatsApp
 * @param {string} telefono
 * @returns {boolean}
 */
async function verificarNumero(telefono) {
  try {
    verificarConexion();
    const jid = normalizarTelefono(telefono);
    const [resultado] = await socket.onWhatsApp(jid);
    return resultado?.exists || false;
  } catch (error) {
    logger.error(`Error al verificar número ${telefono}:`, error);
    return false;
  }
}

/**
 * Enviar mensaje de texto simple
 * @param {string} telefono - Número con código de país
 * @param {string} texto - Contenido del mensaje
 */
async function enviarTexto(telefono, texto) {
  verificarConexion();
  const jid = normalizarTelefono(telefono);

  const resultado = await socket.sendMessage(jid, { text: texto });
  logger.info(`✉️ Texto enviado a ${telefono}`);
  return resultado;
}

/**
 * Enviar imagen con caption opcional
 * @param {string} telefono
 * @param {string} rutaImagen - Ruta local o URL de la imagen
 * @param {string} caption - Texto debajo de la imagen
 */
async function enviarImagen(telefono, rutaImagen, caption = '') {
  verificarConexion();
  const jid = normalizarTelefono(telefono);

  let imagen;
  if (rutaImagen.startsWith('http')) {
    // Si es URL remota
    imagen = { url: rutaImagen };
  } else {
    // Si es archivo local
    imagen = fs.readFileSync(rutaImagen);
  }

  const resultado = await socket.sendMessage(jid, {
    image: imagen,
    caption,
  });

  logger.info(`🖼️ Imagen enviada a ${telefono}`);
  return resultado;
}

/**
 * Enviar documento/archivo
 * @param {string} telefono
 * @param {string} rutaArchivo - Ruta local del documento
 * @param {string} nombreArchivo - Nombre a mostrar
 * @param {string} mimeType - Tipo MIME del archivo
 */
async function enviarDocumento(telefono, rutaArchivo, nombreArchivo, mimeType = 'application/octet-stream', caption = '') {
  verificarConexion();
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

  logger.info(`📄 Documento enviado a ${telefono}`);
  return resultado;
}

/**
 * Obtener el estado actual de la conexión
 */
function obtenerEstado() {
  return {
    estado: estadoConexion,
    usuario: socket?.user?.name || null,
    numero: socket?.user?.id || null,
    tieneQR: !!qrBase64,
  };
}

/**
 * Obtener el QR actual en base64
 */
function obtenerQR() {
  return qrBase64;
}

/**
 * Cerrar la conexión con WhatsApp
 */
async function desconectar() {
  if (socket) {
    await socket.logout();
    socket = null;
    estadoConexion = 'desconectado';
    qrBase64 = null;
    logger.info('WhatsApp desconectado manualmente');
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