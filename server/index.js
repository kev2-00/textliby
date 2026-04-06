const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const googleBooksRoutes = require('./routes/googleBooks');
const { getSessionUser } = require('./utils/sessions');
const requireAuth = require('./middleware/requireAuth');

const app = express();

if (config.isProduction) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(config.sessionSecret));

async function redirectAuthenticatedAuthPages(req, res, next) {
  try {
    const sessionId = req.cookies?.[config.sessionCookieName];
    const session = await getSessionUser(sessionId);

    if (session) {
      return res.redirect('/');
    }

    next();
  } catch (error) {
    next(error);
  }
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: config.nodeEnv,
  });
});

app.get('/login', redirectAuthenticatedAuthPages, (req, res) => {
  res.sendFile(path.join(config.viewsDir, 'login.html'));
});

app.get('/signup', redirectAuthenticatedAuthPages, (req, res) => {
  res.sendFile(path.join(config.viewsDir, 'signup.html'));
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/google-books', googleBooksRoutes);
app.use(express.static(config.publicDir, { index: false }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, () => {
  console.log(`TextLiby server listening on ${config.appBaseUrl}`);
});
