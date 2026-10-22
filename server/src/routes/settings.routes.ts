import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { appSettings, notificationPreferences, payPeriods } from "../db/schema.js";
import { PAYROLL_CALENDAR_KEY, payrollCalendarSchema, type PayrollCalendar } from "../lib/payroll-calendar.js";
import { loadPayrollCalendar, reminderSchedule } from "../services/reminder.service.js";
import { notificationTypesFor } from "../lib/notification-types.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
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

/** Upcoming reminder send times for every open pay period, so admins can check the calendar. */
async function upcomingReminders(db: ReturnType<typeof getDb>, calendar: PayrollCalendar) {
  const periods = await db.select().from(payPeriods).where(ne(payPeriods.status, "CLOSED")).orderBy(asc(payPeriods.endDate));
  const now = Date.now();
  return periods.flatMap((period) => reminderSchedule(period, calendar)
    .filter((reminder) => reminder.at.getTime() > now)
    .map((reminder) => ({ payPeriodId: period.id, periodType: period.type, periodEnd: period.endDate, stage: reminder.stage, at: reminder.at, deadline: reminder.deadline })))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 6);
}

/** When payroll reminder emails go out (admin only). */
settingsRoutes.get("/payroll-calendar", requireRole("ADMIN"), async (c) => {
  const db = getDb(c.env.DB);
  const calendar = await loadPayrollCalendar(db);
  return c.json({ calendar, upcoming: calendar.enabled ? await upcomingReminders(db, calendar) : [] });
});

settingsRoutes.patch("/payroll-calendar", requireRole("ADMIN"), async (c) => {
  const parsed = payrollCalendarSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Check the payroll calendar values." });
  const calendar = parsed.data;
  const db = getDb(c.env.DB);
  await db.insert(appSettings)
    .values({ key: PAYROLL_CALENDAR_KEY, value: calendar, updatedById: c.get("user").id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: calendar, updatedById: c.get("user").id, updatedAt: new Date() } });
  await writeAuditLog(c, "PAYROLL_CALENDAR_UPDATE", "AppSetting", undefined, calendar);
  return c.json({ calendar, upcoming: calendar.enabled ? await upcomingReminders(db, calendar) : [] });
});
