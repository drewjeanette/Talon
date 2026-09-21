ALTER TABLE pay_stubs ADD COLUMN finalized_by_id INTEGER REFERENCES users(id);

UPDATE time_entries
SET edited_by_id = (
  SELECT supervisor_id FROM users WHERE users.id = time_entries.user_id
)
WHERE status IN ('APPROVED', 'REJECTED') AND edited_by_id IS NULL;

UPDATE pay_stubs
SET finalized_by_id = (SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1 ORDER BY id LIMIT 1)
WHERE status IN ('FINALIZED', 'PAID') AND finalized_by_id IS NULL;

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action TEXT,
  requires_action INTEGER DEFAULT 0 NOT NULL,
  read_at INTEGER,
  dismissed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX notifications_recipient_idx ON notifications (recipient_user_id, dismissed_at, created_at);

INSERT INTO notifications (recipient_user_id, sender_user_id, type, title, body, action, requires_action)
SELECT supervisor.id,
       (SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1 ORDER BY id LIMIT 1),
       'REPORT_READY', 'Payroll report ready',
       'Please review the current payroll report details.', 'OPEN_REPORT', 1
FROM users supervisor
WHERE supervisor.role = 'SUPERVISOR' AND supervisor.is_active = 1
  AND EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN' AND is_active = 1)
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.recipient_user_id = supervisor.id AND n.type = 'REPORT_READY'
  );
