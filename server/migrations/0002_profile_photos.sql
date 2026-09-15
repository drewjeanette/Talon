CREATE TABLE user_profile_photos (
  user_id INTEGER PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  photo BLOB NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
