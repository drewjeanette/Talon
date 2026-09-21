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
