const crypto = require('crypto');

const config = require('../config');
const { query } = require('../db');

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);

  const result = await query(
    `
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, expires_at
    `,
    [sessionId, userId, expiresAt]
  );

  return result.rows[0];
}

async function getSessionUser(sessionId) {
  if (!sessionId) {
    return null;
  }

  const result = await query(
    `
      SELECT
        s.id AS session_id,
        s.expires_at,
        u.id AS user_id,
        u.email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      email: row.email,
    },
  };
}

async function revokeSession(sessionId) {
  if (!sessionId) {
    return;
  }

  await query(
    `
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
}

function getSessionCookieOptions() {
  return { ...config.sessionCookieOptions };
}

module.exports = {
  createSession,
  getSessionUser,
  revokeSession,
  getSessionCookieOptions,
};
