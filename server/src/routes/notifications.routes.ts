import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use("*", requireAuth);

notificationRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT n.id, n.type, n.title, n.body, n.action, n.requires_action,
           n.read_at, n.created_at, sender.first_name AS sender_first_name
    FROM notifications n
    LEFT JOIN users sender ON sender.id = n.sender_user_id
    WHERE n.recipient_user_id = ? AND n.dismissed_at IS NULL
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 50
  `).bind(c.get("user").id).all<{
    id: number;
    type: string;
    title: string;
    body: string;
    action: string | null;
    requires_action: number;
    read_at: number | null;
    created_at: number;
    sender_first_name: string | null;
  }>();

  return c.json(rows.results.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    action: row.action,
    requiresAction: Boolean(row.requires_action),
    read: row.read_at !== null,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    senderName: row.sender_first_name ?? "Talon",
  })));
});

export interface TodoItem {
  key: string;
  label: string;
  detail: string;
  count: number;
  /** Where the work is done: an admin section or a dashboard anchor. */
  target: "approvals" | "payroll" | "report" | "time";
  /** When the oldest item in this group started waiting (ISO), for "waiting N days". */
  since: string | null;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const iso = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000).toISOString());

/**
 * The one to-do list for the dashboard. Every item is derived from the work
 * itself, so it stays until that work is done (approved, generated, answered)
 * and can't be cleared by clicking it.
 */
notificationRoutes.get("/todos", async (c) => {
  const me = c.get("user");
  const db = c.env.DB;
  const items: TodoItem[] = [];

  if (me.role === "STUDENT") {
    const rejected = await db.prepare(`
      SELECT COUNT(*) AS n, MIN(e.updated_at) AS since
      FROM time_entries e
      WHERE e.user_id = ? AND e.status = 'REJECTED' AND e.updated_at > unixepoch() - 60 * 86400
        AND NOT EXISTS (SELECT 1 FROM time_entry_change_requests r WHERE r.time_entry_id = e.id AND r.created_at >= e.updated_at)
    `).bind(me.id).first<{ n: number; since: number | null }>();
    if (rejected?.n) items.push({
      key: "rejected-time", target: "time", count: rejected.n, since: iso(rejected.since),
      label: "Fix rejected time",
      detail: `${plural(rejected.n, "time entry", "time entries")} ${rejected.n === 1 ? "was" : "were"} rejected. Send a correction with the right times.`,
    });
    return c.json(items);
  }

  // Admins see every student; supervisors see the students assigned to them.
  const isAdmin = me.role === "ADMIN";
  const scope = isAdmin ? "1 = 1" : "u.id IN (SELECT student_id FROM student_supervisors WHERE supervisor_id = ?)";
  const scoped = (sql: string) => (isAdmin ? db.prepare(sql) : db.prepare(sql).bind(me.id));

  const [entries, corrections, stubs, questions, reports] = await db.batch<{ n: number; since: number | null }>([
    scoped(`SELECT COUNT(*) AS n, MIN(e.clock_out) AS since FROM time_entries e JOIN users u ON u.id = e.user_id
      WHERE e.status = 'PENDING' AND e.clock_out IS NOT NULL AND ${scope}`),
    scoped(`SELECT COUNT(*) AS n, MIN(r.created_at) AS since FROM time_entry_change_requests r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'PENDING' AND ${scope}`),
    isAdmin
      ? db.prepare(`SELECT COUNT(*) AS n, MIN(s.generated_at) AS since FROM pay_stubs s JOIN users u ON u.id = s.user_id
          WHERE s.review_status = 'PENDING' AND u.role = 'STUDENT' AND u.id <> ?`).bind(me.id)
      : scoped(`SELECT COUNT(*) AS n, MIN(s.generated_at) AS since FROM pay_stubs s JOIN users u ON u.id = s.user_id
          WHERE s.review_status = 'PENDING' AND u.role = 'STUDENT' AND ${scope}`),
    // Questions someone else asked, on stubs this person can answer.
    isAdmin
      ? db.prepare(`SELECT COUNT(*) AS n, MIN(s.flagged_at) AS since FROM pay_stubs s JOIN users u ON u.id = s.user_id
          WHERE s.flag_note IS NOT NULL AND s.flag_resolved_at IS NULL AND s.flagged_by_id <> ?`).bind(me.id)
      : db.prepare(`SELECT COUNT(*) AS n, MIN(s.flagged_at) AS since FROM pay_stubs s JOIN users u ON u.id = s.user_id
          WHERE s.flag_note IS NOT NULL AND s.flag_resolved_at IS NULL AND s.flagged_by_id <> ?
            AND u.id IN (SELECT student_id FROM student_supervisors WHERE supervisor_id = ?)`).bind(me.id, me.id),
    db.prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS since FROM notifications
      WHERE recipient_user_id = ? AND type = 'REPORT_READY' AND requires_action = 1 AND dismissed_at IS NULL`).bind(me.id),
  ]).then((results) => results.map((result) => result.results[0] ?? { n: 0, since: null }));

  if (entries.n) items.push({
    key: "time-entries", target: "approvals", count: entries.n, since: iso(entries.since),
    label: "Approve time entries",
    detail: `${plural(entries.n, "shift")} waiting for approval.`,
  });
  if (corrections.n) items.push({
    key: "corrections", target: "approvals", count: corrections.n, since: iso(corrections.since),
    label: "Review time corrections",
    detail: `${plural(corrections.n, "missed punch or correction request", "missed punch or correction requests")} waiting.`,
  });
  if (stubs.n) items.push({
    key: "pay-stubs", target: "approvals", count: stubs.n, since: iso(stubs.since),
    label: "Review student pay stubs",
    detail: `${plural(stubs.n, "pay stub")} waiting for review.`,
  });
  if (questions.n) items.push({
    key: "stub-questions", target: "approvals", count: questions.n, since: iso(questions.since),
    label: "Answer pay stub questions",
    detail: `${plural(questions.n, "question")} flagged on pay stubs.`,
  });
  if (reports.n) items.push({
    key: "report-ready", target: isAdmin ? "payroll" : "report", count: reports.n, since: iso(reports.since),
    label: "Review the payroll report",
    detail: "A payroll report is ready for you to check.",
  });

  if (isAdmin) {
    const periods = await db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'OPEN' AND end_date <= unixepoch() THEN 1 ELSE 0 END) AS to_generate,
        MIN(CASE WHEN status = 'OPEN' AND end_date <= unixepoch() THEN end_date END) AS generate_since,
        SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) AS to_finalize,
        MIN(CASE WHEN status = 'PROCESSING' THEN updated_at END) AS finalize_since
      FROM pay_periods
    `).first<{ to_generate: number | null; generate_since: number | null; to_finalize: number | null; finalize_since: number | null }>();
    if (periods?.to_generate) items.push({
      key: "generate", target: "payroll", count: periods.to_generate, since: iso(periods.generate_since),
      label: "Generate payroll",
      detail: `${plural(periods.to_generate, "pay period")} ended and ${periods.to_generate === 1 ? "needs" : "need"} pay stubs generated.`,
    });
    if (periods?.to_finalize) items.push({
      key: "finalize", target: "payroll", count: periods.to_finalize, since: iso(periods.finalize_since),
      label: "Finalize pay periods",
      detail: `${plural(periods.to_finalize, "pay period")} generated and waiting to be finalized.`,
    });
  }

  return c.json(items);
});

const updateSchema = z.object({
  read: z.boolean().optional(),
  dismissed: z.boolean().optional(),
}).strict().refine((value) => value.read !== undefined || value.dismissed !== undefined);

notificationRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid notification id." });
  const body = updateSchema.parse(await c.req.json());
  const now = new Date();
  const result = await getDb(c.env.DB).update(notifications).set({
    ...(body.read !== undefined ? { readAt: body.read ? now : null } : {}),
    ...(body.dismissed !== undefined ? { dismissedAt: body.dismissed ? now : null } : {}),
  }).where(and(eq(notifications.id, id), eq(notifications.recipientUserId, c.get("user").id))).returning({ id: notifications.id });
  if (!result.length) throw new HTTPException(404, { message: "Notification not found." });
  return c.json({ saved: true });
});
