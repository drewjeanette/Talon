import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { timeEntries, timeEntryChangeRequests, users } from "../db/schema.js";
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
  await c.env.DB.prepare(`
    INSERT INTO notifications (recipient_user_id, sender_user_id, type, title, body, action, requires_action)
    SELECT id, ?, 'CLOCK_OUT', 'Biweekly pay ready',
           (SELECT first_name FROM users WHERE id = ?) || ' clocked out. Review and finalize pay for the current biweekly period.',
           'FINALIZE_PAY', 1
    FROM users WHERE role = 'ADMIN' AND is_active = 1
  `).bind(me.id, me.id).run();
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
  const reviewerIds = [...new Set(entries.filter((entry) => entry.status !== "PENDING" && entry.editedById).map((entry) => entry.editedById!))];
  const reviewers = reviewerIds.length
    ? await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, reviewerIds))
    : [];
  const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.firstName]));
  return c.json(entries.map((entry) => ({
    ...entry,
    reviewedBy: entry.status === "PENDING" || !entry.editedById ? null : reviewerNames.get(entry.editedById) ?? null,
  })));
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

const decisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.status === "REJECTED" && !value.rejectionReason) {
    context.addIssue({ code: "custom", path: ["rejectionReason"], message: "A reason is required when rejecting a time entry." });
  }
});

timeclockRoutes.patch("/:id/decision", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid entry id." });

  const { status, rejectionReason } = decisionSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");

  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry) throw new HTTPException(404, { message: "Time entry not found." });
  if (entry.status !== "PENDING") throw new HTTPException(409, { message: "This time entry has already been reviewed." });

  if (me.role === "SUPERVISOR") {
    const owner = await db.query.users.findFirst({ where: eq(users.id, entry.userId) });
    if (owner?.supervisorId !== me.id) {
      throw new HTTPException(403, { message: "You do not supervise this employee." });
    }
  }

  const [updated] = await db
    .update(timeEntries)
    .set({
      status,
      editedById: me.id,
      rejectionReason: status === "REJECTED" ? rejectionReason : null,
      updatedAt: new Date(),
    })
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
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.id, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Time entry not found." });

  await writeAuditLog(c, "TIME_ENTRY_CORRECT", "TimeEntry", id);
  return c.json(updated);
});

const changeRequestSchema = z.object({
  timeEntryId: z.number().int().positive().nullable().optional(),
  clockIn: z.string().datetime(),
  clockOut: z.string().datetime(),
  reason: z.string().trim().min(3, "Explain why the shift needs to be corrected.").max(500),
});

timeclockRoutes.post("/correction-requests", async (c) => {
  const me = c.get("user");
  if (me.role !== "STUDENT") throw new HTTPException(403, { message: "Only students can request time corrections." });

  const body = changeRequestSchema.parse(await c.req.json());
  const clockIn = new Date(body.clockIn);
  const clockOut = new Date(body.clockOut);
  if (clockOut <= clockIn) throw new HTTPException(400, { message: "Clock-out must be after clock-in." });

  const db = getDb(c.env.DB);
  if (body.timeEntryId) {
    const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, body.timeEntryId) });
    if (!entry || entry.userId !== me.id) throw new HTTPException(404, { message: "Time entry not found." });
    const existing = await db.query.timeEntryChangeRequests.findFirst({
      where: and(
        eq(timeEntryChangeRequests.timeEntryId, body.timeEntryId),
        eq(timeEntryChangeRequests.status, "PENDING")
      ),
    });
    if (existing) throw new HTTPException(409, { message: "A correction for this shift is already awaiting review." });
  }

  const [request] = await db.insert(timeEntryChangeRequests).values({
    userId: me.id,
    timeEntryId: body.timeEntryId ?? null,
    requestedClockIn: clockIn,
    requestedClockOut: clockOut,
    reason: body.reason,
  }).returning();

  await writeAuditLog(c, "TIME_CORRECTION_REQUEST", "TimeEntryChangeRequest", request.id);
  return c.json(request, 201);
});

timeclockRoutes.get("/correction-requests/mine", async (c) => {
  const db = getDb(c.env.DB);
  const requests = await db.select().from(timeEntryChangeRequests)
    .where(eq(timeEntryChangeRequests.userId, c.get("user").id))
    .orderBy(desc(timeEntryChangeRequests.createdAt))
    .limit(50);

  const reviewerIds = [...new Set(requests.map((request) => request.reviewerId).filter((id): id is number => id !== null))];
  const reviewers = reviewerIds.length
    ? await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, reviewerIds))
    : [];
  const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.firstName]));

  return c.json(requests.map((request) => ({
    ...request,
    reviewerName: request.reviewerId ? reviewerNames.get(request.reviewerId) ?? null : null,
  })));
});

timeclockRoutes.get("/correction-requests/pending", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const conditions = [eq(timeEntryChangeRequests.status, "PENDING" as const)];
  if (me.role !== "ADMIN") conditions.push(eq(users.supervisorId, me.id));

  const rows = await db.select({
    id: timeEntryChangeRequests.id,
    timeEntryId: timeEntryChangeRequests.timeEntryId,
    requestedClockIn: timeEntryChangeRequests.requestedClockIn,
    requestedClockOut: timeEntryChangeRequests.requestedClockOut,
    reason: timeEntryChangeRequests.reason,
    currentClockIn: timeEntries.clockIn,
    currentClockOut: timeEntries.clockOut,
    userId: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
  }).from(timeEntryChangeRequests)
    .innerJoin(users, eq(timeEntryChangeRequests.userId, users.id))
    .leftJoin(timeEntries, eq(timeEntryChangeRequests.timeEntryId, timeEntries.id))
    .where(and(...conditions))
    .orderBy(timeEntryChangeRequests.createdAt);

  return c.json(rows.map((row) => ({
    id: row.id,
    timeEntryId: row.timeEntryId,
    requestedClockIn: row.requestedClockIn,
    requestedClockOut: row.requestedClockOut,
    reason: row.reason,
    currentClockIn: row.currentClockIn,
    currentClockOut: row.currentClockOut,
    user: { id: row.userId, firstName: row.firstName, lastName: row.lastName },
  })));
});

const changeRequestDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewerReason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.status === "REJECTED" && !value.reviewerReason) {
    context.addIssue({ code: "custom", path: ["reviewerReason"], message: "A reason is required when denying a correction." });
  }
});

timeclockRoutes.patch("/correction-requests/:id/decision", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid correction request id." });
  const body = changeRequestDecisionSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const request = await db.query.timeEntryChangeRequests.findFirst({ where: eq(timeEntryChangeRequests.id, id) });
  if (!request) throw new HTTPException(404, { message: "Correction request not found." });
  if (request.status !== "PENDING") throw new HTTPException(409, { message: "This correction has already been reviewed." });

  const owner = await db.query.users.findFirst({ where: eq(users.id, request.userId) });
  if (!owner) throw new HTTPException(404, { message: "Student not found." });
  if (me.role === "SUPERVISOR" && owner.supervisorId !== me.id) {
    throw new HTTPException(403, { message: "You do not supervise this student." });
  }

  const review = {
    status: body.status,
    reviewerId: me.id,
    reviewerReason: body.status === "REJECTED" ? body.reviewerReason : null,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  } as const;

  if (body.status === "APPROVED") {
    const entryValues = {
      clockIn: request.requestedClockIn,
      clockOut: request.requestedClockOut,
      source: "MANUAL" as const,
      notes: request.reason,
      status: "APPROVED" as const,
      editedById: me.id,
      rejectionReason: null,
      updatedAt: new Date(),
    };
    if (request.timeEntryId) {
      await db.batch([
        db.update(timeEntries).set(entryValues).where(and(eq(timeEntries.id, request.timeEntryId), eq(timeEntries.userId, request.userId))),
        db.update(timeEntryChangeRequests).set(review).where(eq(timeEntryChangeRequests.id, id)),
      ]);
    } else {
      await db.batch([
        db.insert(timeEntries).values({ userId: request.userId, ...entryValues }),
        db.update(timeEntryChangeRequests).set(review).where(eq(timeEntryChangeRequests.id, id)),
      ]);
    }
  } else {
    await db.update(timeEntryChangeRequests).set(review).where(eq(timeEntryChangeRequests.id, id));
  }

  await writeAuditLog(c, `TIME_CORRECTION_${body.status}`, "TimeEntryChangeRequest", id, { reason: body.reviewerReason ?? null });
  return c.json({ saved: true });
});
