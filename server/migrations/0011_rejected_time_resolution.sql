-- Students may resolve a rejected shift without requesting additional paid time.
-- Keep the original shift, rejection, and review history unchanged.
ALTER TABLE time_entries ADD COLUMN rejection_acknowledged_at INTEGER;
