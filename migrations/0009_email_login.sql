-- Sign in with a link sent by email (and Apple, ready for later). Only a SHA-256 hash of the
-- link token is stored; a link works once and for 15 minutes.

CREATE TABLE login_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ref_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX login_links_email ON login_links(email, created_at);

ALTER TABLE users ADD COLUMN apple_sub TEXT;
CREATE UNIQUE INDEX users_apple ON users(apple_sub) WHERE apple_sub IS NOT NULL;
CREATE INDEX users_email ON users(email COLLATE NOCASE);
