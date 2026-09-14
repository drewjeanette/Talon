import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { timeEntries, users } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import type { AppEnv } from "../types.js";

export const timeclockRoutes = new Hono<AppEnv>();

timeclockRoutes.use("*", requireAuth);

timeclockRoutes.post("/clock-in", async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");

  const open = await db.query.timeEntries.findFirst({
    where: and(eq(timeEntries.userId, me.id), isNull(timeEntries.clockOut)),
  });
  if (open) throw new HTTPException(409, { message: "Already clocked in." });

  const [entry] = await db
    .insert(timeEntries)
    .values({ userId: me.id, clockIn: new Date(), source: "WEB" })
    .returning();

  await writeAuditLog(c, "CLOCK_IN", "TimeEntry", entry.id);
  return c.json(entry, 201);
});

timeclockRoutes.post("/clock-out", async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");

  const open = await db.query.timeEntries.findFirst({
    where: and(eq(timeEntries.userId, me.id), isNull(timeEntries.clockOut)),
  });
  if (!open) throw new HTTPException(409, { message: "Not currently clocked in." });

  const [entry] = await db
    .update(timeEntries)
    .set({ clockOut: new Date() })
    .where(eq(timeEntries.id, open.id))
    .returning();

  await writeAuditLog(c, "CLOCK_OUT", "TimeEntry", entry.id);
  return c.json(entry);
});

timeclockRoutes.get("/my-entries", async (c) => {
  const db = getDb(c.env.DB);
  const entries = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.userId, c.get("user").id))
    .orderBy(desc(timeEntries.clockIn))
    .limit(100);
  return c.json(entries);
});

timeclockRoutes.get("/pending", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");

  // Supervisors see only their own direct reports. Enforced in the query, not
  // just hidden in the UI.
  const conditions = [eq(timeEntries.status, "PENDING" as const)];
  if (me.role !== "ADMIN") conditions.push(eq(users.supervisorId, me.id));

  const rows = await db
    .select({
      id: timeEntries.id,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      status: timeEntries.status,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(and(...conditions))
    .orderBy(timeEntries.clockIn);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      status: r.status,
      user: { id: r.userId, firstName: r.firstName, lastName: r.lastName },
    }))
  );
});

const decisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

timeclockRoutes.patch("/:id/decision", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid entry id." });

  const { status } = decisionSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");

  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry) throw new HTTPException(404, { message: "Time entry not found." });

  if (me.role === "SUPERVISOR") {
    const owner = await db.query.users.findFirst({ where: eq(users.id, entry.userId) });
    if (owner?.supervisorId !== me.id) {
      throw new HTTPException(403, { message: "You do not supervise this employee." });
    }
  }

  const [updated] = await db
    .update(timeEntries)
    .set({ status, editedById: me.id, updatedAt: new Date() })
    .where(eq(timeEntries.id, id))
    .returning();

  await writeAuditLog(c, `TIME_ENTRY_${status}`, "TimeEntry", id);
  return c.json(updated);
});

const correctionSchema = z.object({
  clockIn: z.string().datetime(),
  clockOut: z.string().datetime().nullable(),
  notes: z.string().max(500).optional(),
});

timeclockRoutes.patch("/:id/correct", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid entry id." });

  const body = correctionSchema.parse(await c.req.json());
  const clockIn = new Date(body.clockIn);
  const clockOut = body.clockOut ? new Date(body.clockOut) : null;
  if (clockOut && clockOut <= clockIn) {
    throw new HTTPException(400, { message: "clockOut must be after clockIn." });
  }

  const db = getDb(c.env.DB);
  const me = c.get("user");

  if (me.role === "SUPERVISOR") {
    const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
    if (!entry) throw new HTTPException(404, { message: "Time entry not found." });
    const owner = await db.query.users.findFirst({ where: eq(users.id, entry.userId) });
    if (owner?.supervisorId !== me.id) {
      throw new HTTPException(403, { message: "You do not supervise this employee." });
    }
  }

  // A correction re-enters the approval queue rather than silently taking
  // effect, and records who made it.
  const [updated] = await db
    .update(timeEntries)
    .set({
      clockIn,
      clockOut,
      notes: body.notes ?? null,
      status: "PENDING",
      editedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.id, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Time entry not found." });

  await writeAuditLog(c, "TIME_ENTRY_CORRECT", "TimeEntry", id);
  return c.json(updated);
});
