const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { query } = require('../db');
const {
  normalizeEmail,
  isValidEmail,
  validatePassword,
} = require('../utils/validation');
const {
  createSession,
  getSessionUser,
  revokeSession,
  getSessionCookieOptions,
} = require('../utils/sessions');

// Keep authentication concerns isolated inside their own router.
const router = express.Router();

// Slow down brute-force attempts against login and signup endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// Mirror the login cookie settings so logout and session cleanup target the right cookie shape.
const clearCookieOptions = {
  httpOnly: true,
  sameSite: config.sessionCookieOptions.sameSite,
  secure: config.sessionCookieOptions.secure,
  path: config.sessionCookieOptions.path,
};

// Return only safe user fields to the browser.
function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
  };
}

// Create an account, hash the password, and immediately sign the new user in.
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id, email
      `,
      [email, passwordHash]
    );

    const user = result.rows[0];
    const session = await createSession(user.id);

    res.cookie(config.sessionCookieName, session.id, getSessionCookieOptions());
    res.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    next(error);
  }
});

// Verify credentials and issue a fresh session cookie for the browser.
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await query(
      `
        SELECT id, email, password_hash
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const session = await createSession(user.id);

    res.cookie(config.sessionCookieName, session.id, getSessionCookieOptions());
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

// Revoke the current session server-side and clear the browser cookie.
router.post('/logout', async (req, res, next) => {
  try {
    const sessionId = req.cookies?.[config.sessionCookieName];
    if (sessionId) {
      await revokeSession(sessionId);
    }

    res.clearCookie(config.sessionCookieName, clearCookieOptions);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Let the frontend bootstrap itself by asking who is currently signed in.
router.get('/me', async (req, res, next) => {
  try {
    const sessionId = req.cookies?.[config.sessionCookieName];
    const session = await getSessionUser(sessionId);

    if (!session) {
      res.clearCookie(config.sessionCookieName, clearCookieOptions);
      return res.status(401).json({ error: 'Authentication required.' });
    }

    res.json({ user: session.user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
