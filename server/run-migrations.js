const fs = require('fs');
const path = require('path');

const config = require('./config');
const { pool } = require('./db');

// Keep migration history in a dedicated table so each SQL file runs only once.
const MIGRATIONS_TABLE = 'schema_migrations';

// Guarantee the migration ledger exists before we inspect or record applied files.
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// Load the set of already-applied filenames for quick membership checks during the run.
async function getAppliedMigrations(client) {
  const result = await client.query(
    `
      SELECT filename
      FROM ${MIGRATIONS_TABLE}
    `
  );

  return new Set(result.rows.map((row) => row.filename));
}

// Read every SQL file in lexical order and execute only the migrations that have not been recorded yet.
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
    // All migration bookkeeping happens through the same client so transactions stay consistent.
    await ensureMigrationsTable(client);
    const appliedMigrations = await getAppliedMigrations(client);
    let ranAnyMigration = false;

    for (const file of files) {
      // Skip anything already present in the migration ledger.
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

      // Each file runs inside its own transaction so a failed migration does not leave partial schema changes.
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
    // Roll back the active transaction when possible, then report the failure for the deploy/start script.
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    // Always release the client and close the process-wide pool when the migration script exits.
    client.release();
    await pool.end();
  }
}

// Execute immediately because this file is used as a standalone CLI script.
runMigrations();
