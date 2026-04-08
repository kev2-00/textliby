const { Pool } = require('pg');
const config = require('./config');

// Create a shared Postgres pool so every route and utility reuses the same connection management.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Surface unexpected driver-level failures that happen outside individual queries.
pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

// Small wrapper so the rest of the codebase does not need to import the pool directly for simple queries.
function query(text, params = []) {
  return pool.query(text, params);
}

// Used during startup to fail fast if the database is unreachable.
async function verifyDatabaseConnection() {
  await pool.query('SELECT 1');
}

module.exports = {
  pool,
  query,
  verifyDatabaseConnection,
};
