import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { notificationPreferences } from "../db/schema.js";
import { notificationTypesFor } from "../lib/notification-types.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import type { AppEnv } from "../types.js";

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use("*", requireAuth);

const updateNotificationsSchema = z.object({
  preferences: z
    .array(z.object({ type: z.string().min(1).max(64), emailEnabled: z.boolean() }))
    .max(50),
});

/** The email notifications available to the caller's role, with their current choice. */
settingsRoutes.get("/notifications", async (c) => {
  const me = c.get("user");
  const saved = await getDb(c.env.DB)
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, me.id));
  const enabled = new Map(saved.map((row) => [row.type, row.emailEnabled]));

  return c.json(
    notificationTypesFor(me.role).map(({ type, label, description }) => ({
      type,
      label,
      description,
      emailEnabled: enabled.get(type) ?? true,
    }))
  );
});

settingsRoutes.patch("/notifications", async (c) => {
  const me = c.get("user");
  const { preferences } = updateNotificationsSchema.parse(await c.req.json());
  const allowed = new Set(notificationTypesFor(me.role).map((t) => t.type));
  const unknown = preferences.find((p) => !allowed.has(p.type));
  if (unknown) throw new HTTPException(400, { message: `Unknown notification type: ${unknown.type}` });
  if (preferences.length === 0) return c.body(null, 204);

  const db = getDb(c.env.DB);
  await db
    .insert(notificationPreferences)
    .values(preferences.map((p) => ({ userId: me.id, type: p.type, emailEnabled: p.emailEnabled })))
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: { emailEnabled: sql`excluded.email_enabled`, updatedAt: sql`(unixepoch())` },
    });

  await writeAuditLog(c, "NOTIFICATION_SETTINGS_UPDATE", "User", me.id, {
    off: preferences.filter((p) => !p.emailEnabled).map((p) => p.type),
  });
  return c.body(null, 204);
});
