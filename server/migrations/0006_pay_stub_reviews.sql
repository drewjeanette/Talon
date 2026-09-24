ALTER TABLE pay_stubs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE pay_stubs ADD COLUMN reviewed_by_id INTEGER REFERENCES users(id);
ALTER TABLE pay_stubs ADD COLUMN reviewed_at INTEGER;
ALTER TABLE pay_stubs ADD COLUMN review_reason TEXT;

CREATE INDEX pay_stubs_review_status_idx ON pay_stubs(review_status, pay_period_id);
