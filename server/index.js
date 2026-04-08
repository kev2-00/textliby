const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { pool, verifyDatabaseConnection } = require('./db');
const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const googleBooksRoutes = require('./routes/googleBooks');
const { getSessionUser } = require('./utils/sessions');
const requireAuth = require('./middleware/requireAuth');

// Create the Express application and attach the shared middleware stack.
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

// Keep signed-in users from revisiting login/signup once their session is already active.
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

// Health and page routes.
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

// Mount API routers before static assets so requests hit the right handler first.
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/google-books', googleBooksRoutes);
app.use(express.static(config.publicDir, { index: false }));

// Return a consistent JSON response for unknown API endpoints.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

// Final error handler for unexpected failures anywhere in the request pipeline.
app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({ error: 'Internal server error.' });
});

let server = null;

let isShuttingDown = false;

// Wrap server.close in a promise so the shutdown flow can await it.
function closeServer() {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

// Close the HTTP server and database pool exactly once when the process receives a fatal signal.
async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down TextLiby...`);

  try {
    await closeServer();
    await pool.end();
  } catch (error) {
    console.error('Shutdown failed:', error);
    process.exitCode = 1;
    process.exit(1);
    return;
  }

  process.exitCode = exitCode;
  process.exit(exitCode);
}

// Verify the database first, then begin accepting HTTP traffic.
async function startServer() {
  try {
    await verifyDatabaseConnection();
    console.log('PostgreSQL connection verified.');

    server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`TextLiby server listening on port ${config.port} (${config.nodeEnv})`);
    });
  } catch (error) {
    console.error('Failed to start TextLiby:', error);

    try {
      await pool.end();
    } catch (shutdownError) {
      console.error('Failed to close PostgreSQL pool after startup error:', shutdownError);
    }

    process.exit(1);
  }
}

// Convert process-level failures into the same graceful shutdown path.
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  void shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  void shutdown('unhandledRejection', 1);
});

void startServer();
