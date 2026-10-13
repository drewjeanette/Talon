-- Business office review (October 2026): charge accounts, several supervisors
-- per student, preferred names, pay stub line items, and pay stub questions.

-- Charge accounts (Banner "index"). A job is charged to an account that can
-- belong to a different department than the student's home department.
CREATE TABLE charge_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE users ADD COLUMN preferred_name TEXT;
ALTER TABLE users ADD COLUMN charge_account_id INTEGER REFERENCES charge_accounts(id);

-- Copied from the user's job when they clock in, so changing a job's account
-- later never rewrites hours already worked.
ALTER TABLE time_entries ADD COLUMN charge_account_id INTEGER REFERENCES charge_accounts(id);
CREATE INDEX time_entries_charge_account_idx ON time_entries (charge_account_id);

-- Any assigned supervisor can approve a student's time; there is no primary.
CREATE TABLE student_supervisors (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (student_id, supervisor_id)
);
CREATE INDEX student_supervisors_supervisor_idx ON student_supervisors (supervisor_id);

INSERT INTO student_supervisors (student_id, supervisor_id)
SELECT id, supervisor_id FROM users WHERE supervisor_id IS NOT NULL;

DROP INDEX users_supervisor_idx;
ALTER TABLE users DROP COLUMN supervisor_id;

-- Line items are stored when stubs are generated so a later rate change does
-- not alter what a past stub says.
ALTER TABLE pay_stubs ADD COLUMN hourly_rate_cents INTEGER;
ALTER TABLE pay_stubs ADD COLUMN regular_pay_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pay_stubs ADD COLUMN overtime_pay_cents INTEGER NOT NULL DEFAULT 0;

UPDATE pay_stubs SET hourly_rate_cents = (SELECT hourly_rate_cents FROM users WHERE users.id = pay_stubs.user_id);
UPDATE pay_stubs SET regular_pay_cents = CASE
    WHEN hourly_rate_cents IS NULL OR regular_minutes + overtime_minutes = 0 THEN gross_pay_cents
    ELSE MIN(gross_pay_cents, CAST(ROUND(regular_minutes * hourly_rate_cents / 60.0) AS INTEGER))
  END;
UPDATE pay_stubs SET overtime_pay_cents = gross_pay_cents - regular_pay_cents;

-- A question about a stub, open until someone resolves it.
ALTER TABLE pay_stubs ADD COLUMN flag_note TEXT;
ALTER TABLE pay_stubs ADD COLUMN flagged_by_id INTEGER REFERENCES users(id);
ALTER TABLE pay_stubs ADD COLUMN flagged_at INTEGER;
ALTER TABLE pay_stubs ADD COLUMN flag_resolved_at INTEGER;
ALTER TABLE pay_stubs ADD COLUMN flag_resolution TEXT;

-- Each scheduled reminder is sent once per pay period and stage.
CREATE TABLE reminder_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  pay_period_id INTEGER NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX reminder_runs_period_stage_idx ON reminder_runs (pay_period_id, stage);

-- Admins are no longer pinged on every clock-out; open payroll work shows in
-- the dashboard to-do list until it is done.
DELETE FROM notifications WHERE type = 'CLOCK_OUT';
