const path = require('path');
const dotenv = require('dotenv');

// Load environment variables before any config values are derived.
dotenv.config({ quiet: true });

// Read optional values safely so downstream config code can treat missing vars as empty strings.
function getOptionalEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

// Stop startup immediately when a required setting is missing.
function getRequiredEnv(name) {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Parse numeric environment variables once so every caller gets the same validation behavior.
function getIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }

  return parsed;
}

// Support Railway-style discrete Postgres variables when a full connection URL is not provided.
function buildDatabaseUrlFromParts() {
  const host = getOptionalEnv('PGHOST');
  const port = getOptionalEnv('PGPORT');
  const user = getOptionalEnv('PGUSER');
  const password = process.env.PGPASSWORD || '';
  const database = getOptionalEnv('PGDATABASE');

  if (!host || !port || !user || !database) {
    return '';
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);

  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
}

// Prefer explicit URLs first, then fall back to rebuilding one from provider-specific variables.
function getDatabaseUrl() {
  return (
    getOptionalEnv('DATABASE_URL') ||
    getOptionalEnv('DATABASE_PUBLIC_URL') ||
    buildDatabaseUrlFromParts() ||
    (() => {
      throw new Error(
        'Missing database configuration. Set DATABASE_URL, DATABASE_PUBLIC_URL, or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.'
      );
    })()
  );
}

// Derive environment-aware runtime values once and export them for the rest of the application.
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionTtlDays = getIntegerEnv('SESSION_TTL_DAYS', 30);
const sessionTtlMs = sessionTtlDays * 24 * 60 * 60 * 1000;

module.exports = {
  port: getIntegerEnv('PORT', 3000),
  nodeEnv,
  isProduction,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  databaseUrl: getDatabaseUrl(),
  sessionSecret: getRequiredEnv('SESSION_SECRET'),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'textliby_session',
  sessionTtlDays,
  sessionTtlMs,
  googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || '',
  projectRoot: path.resolve(__dirname, '..'),
  publicDir: path.resolve(__dirname, '..', 'public'),
  viewsDir: path.resolve(__dirname, '..', 'views'),
  migrationsDir: path.resolve(__dirname, '..', 'migrations'),
  sessionCookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: sessionTtlMs,
  },
};
