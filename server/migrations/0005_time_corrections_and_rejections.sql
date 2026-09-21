ALTER TABLE time_entries ADD COLUMN rejection_reason TEXT;

CREATE TABLE time_entry_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_entry_id INTEGER REFERENCES time_entries(id) ON DELETE SET NULL,
  requested_clock_in INTEGER NOT NULL,
  requested_clock_out INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING' NOT NULL,
  reviewer_id INTEGER REFERENCES users(id),
  reviewer_reason TEXT,
  reviewed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX time_entry_change_requests_user_idx
  ON time_entry_change_requests (user_id, created_at);

CREATE INDEX time_entry_change_requests_status_idx
  ON time_entry_change_requests (status, created_at);
