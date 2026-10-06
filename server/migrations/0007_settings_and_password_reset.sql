-- Per-user email notification choices. A missing row means the default (on).
CREATE TABLE notification_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, type)
);

-- Single-use "forgot password" links. Only the SHA-256 of the token is stored.
CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  requested_ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens(user_id, created_at);
CREATE INDEX password_reset_tokens_ip_idx ON password_reset_tokens(requested_ip, created_at);
