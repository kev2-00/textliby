const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

function query(text, params = []) {
  return pool.query(text, params);
}

async function verifyDatabaseConnection() {
  await pool.query('SELECT 1');
}

module.exports = {
  pool,
  query,
  verifyDatabaseConnection,
};
