/** The dashboard and its to-do count must agree on which shifts need action. */
export async function unresolvedRejectedTime(db: D1Database, studentId: number) {
  const rows = await db.prepare(`
    SELECT e.id, e.updated_at AS updatedAt
    FROM time_entries e
    WHERE e.user_id = ? AND e.status = 'REJECTED'
      AND e.rejection_acknowledged_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM time_entry_change_requests r
        WHERE r.time_entry_id = e.id AND r.created_at >= e.updated_at
          AND r.status IN ('PENDING', 'APPROVED')
      )
    ORDER BY e.clock_in DESC, e.id DESC
  `).bind(studentId).all<{ id: number; updatedAt: number }>();
  return rows.results;
}
