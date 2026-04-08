const config = require('../config');
const { getSessionUser } = require('../utils/sessions');

// Match the cookie attributes used during login so clearing works reliably in every environment.
const clearCookieOptions = {
  httpOnly: true,
  sameSite: config.sessionCookieOptions.sameSite,
  secure: config.sessionCookieOptions.secure,
  path: config.sessionCookieOptions.path,
};

// Browser page requests should redirect, while API callers should get JSON.
function wantsHtml(req) {
  return req.accepts(['html', 'json']) === 'html';
}

// Resolve the signed-in user from the session cookie and attach that user to the request object.
async function requireAuth(req, res, next) {
  try {
    const sessionId = req.cookies?.[config.sessionCookieName];
    const session = await getSessionUser(sessionId);

    if (!session) {
      res.clearCookie(config.sessionCookieName, clearCookieOptions);

      if (wantsHtml(req) && !req.originalUrl.startsWith('/api/')) {
        return res.redirect('/login');
      }

      return res.status(401).json({ error: 'Authentication required.' });
    }

    req.sessionId = session.sessionId;
    req.user = session.user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireAuth;
