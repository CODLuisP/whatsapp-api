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

// ── Modelo: Usuario ───────────────────────────────────────────
const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  api_key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'users',
  underscored: true,
});

// ── Modelo: Campaña ───────────────────────────────────────────
const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: { model: User, key: 'id' },
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
  tipo:           { type: DataTypes.STRING, defaultValue: 'masivo' },
  // valores tipo: individual | masivo
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
  user_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: { model: User, key: 'id' },
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

// Relaciones
User.hasMany(Campaign, { foreignKey: 'user_id' });
Campaign.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Message, { foreignKey: 'user_id' });
Message.belongsTo(User, { foreignKey: 'user_id' });

Campaign.hasMany(Message, { foreignKey: 'campaign_id' });
Message.belongsTo(Campaign, { foreignKey: 'campaign_id' });

/**
 * Inicializar la base de datos (crear tablas si no existen)
 */
async function initDatabase() {
  await sequelize.sync();

  // Migración: agregar columna tipo si no existe (SQLite no soporta IF NOT EXISTS en ALTER)
  await sequelize.query("ALTER TABLE campaigns ADD COLUMN tipo TEXT DEFAULT 'masivo'").catch(() => {});

  // Migración: marcar registros históricos individuales (nombre empieza con "Individual - ")
  await sequelize.query(
    "UPDATE campaigns SET tipo = 'individual' WHERE tipo IS NULL OR (tipo = 'masivo' AND nombre LIKE 'Individual - %')"
  ).catch(() => {});

  logger.info('✅ Base de datos inicializada correctamente');
}

// ── Helpers para usuarios ─────────────────────────────────────
const userDb = {
  crear: (datos) => User.create(datos),
  obtenerPorId: (id) => User.findByPk(id, { raw: true }),
  obtenerPorApiKey: (api_key) => User.findOne({ where: { api_key }, raw: true }),
  listarTodos: () => User.findAll({ raw: true }),
  eliminarPorId: (id) => User.destroy({ where: { id } }),
};

// ── Helpers para campañas ─────────────────────────────────────
const campaignDb = {
  crear: (datos) => Campaign.create(datos),

  actualizar: (id, user_id, datos) => Campaign.update(datos, { where: { id, user_id } }),

  obtenerPorId: (id, user_id) => Campaign.findOne({ where: { id, user_id }, raw: true }),

  listarTodos: (user_id, tipo = 'masivo') => Campaign.findAll({
    where: { user_id, tipo },
    order: [['created_at', 'DESC']],
    raw: true,
  }),

  incrementarContador: async (id, user_id, campo) => {
    await sequelize.query(
      `UPDATE campaigns SET ${campo} = ${campo} + 1 WHERE id = :id AND user_id = :user_id`,
      { replacements: { id, user_id } }
    );
  },
};

// ── Helpers para mensajes ─────────────────────────────────────
const messageDb = {
  crear: (datos) => Message.create(datos),

  crearBatch: (mensajes) => Message.bulkCreate(mensajes),

  actualizar: (id, user_id, datos) => Message.update(datos, { where: { id, user_id } }),

  listarPorCampaña: (campaignId, user_id) => Message.findAll({
    where: { campaign_id: campaignId, user_id },
    order: [['created_at', 'ASC']],
    raw: true,
  }),

  obtenerPendientesPorCampaña: (campaignId, user_id) => Message.findAll({
    where: { campaign_id: campaignId, user_id, estado: 'pendiente' },
    order: [['created_at', 'ASC']],
    raw: true,
  }),

  listarTodos: (user_id, filtros = {}) => {
    const where = { user_id };
    if (filtros.estado) where.estado = filtros.estado;
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.campaign_id) where.campaign_id = filtros.campaign_id;
    const limit  = parseInt(filtros.limit)  || 50;
    const offset = parseInt(filtros.page)   ? (parseInt(filtros.page) - 1) * limit : 0;
    return Message.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      raw: true,
    });
  },
};

module.exports = { initDatabase, sequelize, User, Campaign, Message, userDb, campaignDb, messageDb };
