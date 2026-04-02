// ============================================================
// BASE DE DATOS SQLite con Sequelize
// Usa sqlite3 que tiene binarios precompilados para Windows
// (no requiere compilar C++ con Visual Studio)
// ============================================================
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_PATH = process.env.DATABASE_PATH || './data/whatsapp.db';

// Asegurar que el directorio exista
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Instancia de Sequelize con SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: DB_PATH,
  logging: false, // Silenciar logs SQL (usamos nuestro propio logger)
});

// ── Modelo: Campaña ───────────────────────────────────────────
const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  estado: {
    type: DataTypes.STRING,
    defaultValue: 'pendiente',
    // valores: pendiente, en_proceso, completada, completada_con_errores, cancelada, error
  },
  total_mensajes: { type: DataTypes.INTEGER, defaultValue: 0 },
  enviados:       { type: DataTypes.INTEGER, defaultValue: 0 },
  fallidos:       { type: DataTypes.INTEGER, defaultValue: 0 },
  pendientes:     { type: DataTypes.INTEGER, defaultValue: 0 },
  delay_ms:       { type: DataTypes.INTEGER, defaultValue: 3000 },
  completado_en:  { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'campaigns',
  underscored: true,
});

// ── Modelo: Mensaje ───────────────────────────────────────────
const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  campaign_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: { model: Campaign, key: 'id' },
  },
  telefono:     { type: DataTypes.STRING, allowNull: false },
  texto:        { type: DataTypes.TEXT, allowNull: true },
  tipo:         { type: DataTypes.STRING, defaultValue: 'texto' },
  // tipos: texto, imagen, documento
  archivo_url:  { type: DataTypes.STRING, allowNull: true },
  estado:       { type: DataTypes.STRING, defaultValue: 'pendiente' },
  // estados: pendiente, enviado, fallido
  error_detalle: { type: DataTypes.TEXT, allowNull: true },
  intentos:     { type: DataTypes.INTEGER, defaultValue: 0 },
  enviado_en:   { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'messages',
  underscored: true,
});

// Relación: una campaña tiene muchos mensajes
Campaign.hasMany(Message, { foreignKey: 'campaign_id' });
Message.belongsTo(Campaign, { foreignKey: 'campaign_id' });

/**
 * Inicializar la base de datos (crear tablas si no existen)
 */
async function initDatabase() {
  await sequelize.sync({ alter: false });
  logger.info('✅ Base de datos inicializada correctamente');
}

// ── Helpers para campañas ─────────────────────────────────────
const campaignDb = {
  crear: (datos) => Campaign.create(datos),

  actualizar: (id, datos) => Campaign.update(datos, { where: { id } }),

  obtenerPorId: (id) => Campaign.findByPk(id, { raw: true }),

  listarTodos: () => Campaign.findAll({
    order: [['created_at', 'DESC']],
    raw: true,
  }),

  incrementarContador: async (id, campo) => {
    await sequelize.query(
      `UPDATE campaigns SET ${campo} = ${campo} + 1 WHERE id = :id`,
      { replacements: { id } }
    );
  },
};

// ── Helpers para mensajes ─────────────────────────────────────
const messageDb = {
  crear: (datos) => Message.create(datos),

  crearBatch: (mensajes) => Message.bulkCreate(mensajes),

  actualizar: (id, datos) => Message.update(datos, { where: { id } }),

  listarPorCampaña: (campaignId) => Message.findAll({
    where: { campaign_id: campaignId },
    order: [['created_at', 'ASC']],
    raw: true,
  }),

  obtenerPendientesPorCampaña: (campaignId) => Message.findAll({
    where: { campaign_id: campaignId, estado: 'pendiente' },
    order: [['created_at', 'ASC']],
    raw: true,
  }),
};

module.exports = { initDatabase, sequelize, Campaign, Message, campaignDb, messageDb };
