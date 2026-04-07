const fs = require('fs');
const path = require('path');

const config = require('./config');
const { pool } = require('./db');

const MIGRATIONS_TABLE = 'schema_migrations';

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    `
      SELECT filename
      FROM ${MIGRATIONS_TABLE}
    `
  );

  return new Set(result.rows.map((row) => row.filename));
}

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
    await ensureMigrationsTable(client);
    const appliedMigrations = await getAppliedMigrations(client);
    let ranAnyMigration = false;

    for (const file of files) {
      if (appliedMigrations.has(file)) {
        console.log(`Skipping already applied migration: ${file}`);
        continue;
      }

      const fullPath = path.join(config.migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8').trim();

      if (!sql) {
        console.log(`Skipping empty migration: ${file}`);
        continue;
      }

      console.log(`Running migration: ${file}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `
          INSERT INTO schema_migrations (filename)
          VALUES ($1)
        `,
        [file]
      );
      await client.query('COMMIT');
      appliedMigrations.add(file);
      ranAnyMigration = true;
    }

    if (!ranAnyMigration) {
      console.log('No pending migrations.');
      return;
    }

    console.log('All pending migrations completed successfully.');
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
