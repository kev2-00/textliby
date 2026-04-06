const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }

  return parsed;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionTtlDays = getIntegerEnv('SESSION_TTL_DAYS', 30);
const sessionTtlMs = sessionTtlDays * 24 * 60 * 60 * 1000;

module.exports = {
  port: getIntegerEnv('PORT', 3000),
  nodeEnv,
  isProduction,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  databaseUrl: getRequiredEnv('DATABASE_URL'),
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
