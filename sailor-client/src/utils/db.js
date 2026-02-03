/**
 * PostgreSQL Database Connection
 */

const { Pool } = require('pg');
const config = require('../config');
const logger = require('./logger');

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { error: err.message });
});

/**
 * Execute a query
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Database query error', { error: error.message, query: text });
    throw error;
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error: error.message });
    return false;
  }
}

module.exports = {
  query,
  testConnection,
  pool,
};
