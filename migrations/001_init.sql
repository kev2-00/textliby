-- Core user accounts used for login and ownership of all library data.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
);

-- Browser sessions map a secure cookie token back to the signed-in user.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Books belong to a user and store both catalog metadata and reading progress.
CREATE TABLE IF NOT EXISTS books (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  isbn TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'novel',
  status TEXT NOT NULL DEFAULT 'unread',
  rating INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  year INTEGER,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT books_category_valid CHECK (category IN ('textbook', 'novel')),
  CONSTRAINT books_status_valid CHECK (status IN ('unread', 'reading', 'read')),
  CONSTRAINT books_rating_valid CHECK (rating BETWEEN 0 AND 5),
  CONSTRAINT books_year_valid CHECK (year IS NULL OR (year BETWEEN 0 AND 9999))
);

-- Indexes keep the most common auth and library lookups fast.
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_added_at ON books(user_id, added_at DESC);
