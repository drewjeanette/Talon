-- Students can hold several jobs, each charged to its own account, and pick
-- the job when they clock in.
CREATE TABLE student_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  charge_account_id INTEGER REFERENCES charge_accounts(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX student_jobs_user_idx ON student_jobs (user_id, is_active);

-- Every existing student gets one job from their current charge account.
INSERT INTO student_jobs (user_id, title, charge_account_id)
SELECT u.id, COALESCE(a.name, 'Student worker'), u.charge_account_id
FROM users u LEFT JOIN charge_accounts a ON a.id = u.charge_account_id
WHERE u.role = 'STUDENT';

ALTER TABLE time_entries ADD COLUMN job_id INTEGER REFERENCES student_jobs(id);
UPDATE time_entries SET job_id = (
  SELECT j.id FROM student_jobs j WHERE j.user_id = time_entries.user_id ORDER BY j.id LIMIT 1
);

-- Admin-editable settings, one JSON value per key (e.g. the payroll calendar).
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_by_id INTEGER REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- A missed-shift request from a student with several jobs says which job.
ALTER TABLE time_entry_change_requests ADD COLUMN job_id INTEGER REFERENCES student_jobs(id);
