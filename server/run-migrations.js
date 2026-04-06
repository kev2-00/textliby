const fs = require('fs');
const path = require('path');

const config = require('./config');
const { pool } = require('./db');

async function runMigrations() {
  const files = fs
    .readdirSync(config.migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = await pool.connect();

  try {
    for (const file of files) {
      const fullPath = path.join(config.migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8').trim();

      if (!sql) {
        console.log(`Skipping empty migration: ${file}`);
        continue;
      }

      console.log(`Running migration: ${file}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    }

    console.log('All migrations completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
