import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { chargeAccounts, studentJobs, timeEntries, timeEntryChangeRequests, users } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import { activeJobFor, jobsByUser } from "../services/jobs.service.js";
import { assertCanManageStudent, fullName, supervisedStudentIds, supervisorsByStudent } from "../services/access.service.js";
import type { AppEnv } from "../types.js";

export const timeclockRoutes = new Hono<AppEnv>();

timeclockRoutes.use("*", requireAuth);

/** The signed-in student's current jobs, for choosing one at clock-in. */
timeclockRoutes.get("/my-jobs", async (c) => {
  const me = c.get("user");
  return c.json((await jobsByUser(getDb(c.env.DB), [me.id])).get(me.id) ?? []);
});

const clockInSchema = z.object({ jobId: z.number().int().positive().optional() });

timeclockRoutes.post("/clock-in", async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const { jobId } = clockInSchema.parse(await c.req.json().catch(() => ({})));

  const open = await db.query.timeEntries.findFirst({
    where: and(eq(timeEntries.userId, me.id), isNull(timeEntries.clockOut)),
  });
  if (open) throw new HTTPException(409, { message: "Already clocked in." });

  // The shift is charged to the chosen job's account as of clock-in. With
  // several jobs the student must say which one.
  const jobs = (await jobsByUser(db, [me.id])).get(me.id) ?? [];
  if (jobs.length > 1 && !jobId) throw new HTTPException(422, { message: "Choose which job you are clocking in for." });
  const job = jobId ? await activeJobFor(db, me.id, jobId) : null;
  const owner = await db.query.users.findFirst({ where: eq(users.id, me.id), columns: { chargeAccountId: true } });
  const chosen = job ?? (jobs[0] ? { id: jobs[0].id, chargeAccountId: jobs[0].chargeAccount?.id ?? null } : null);
  const [entry] = await db
    .insert(timeEntries)
    .values({
      userId: me.id,
      clockIn: new Date(),
      source: "WEB",
      jobId: chosen?.id ?? null,
      chargeAccountId: chosen?.chargeAccountId ?? owner?.chargeAccountId ?? null,
    })
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
  const reviewerIds = [...new Set(entries.filter((entry) => entry.status !== "PENDING" && entry.editedById).map((entry) => entry.editedById!))];
  const reviewers = reviewerIds.length
    ? await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, reviewerIds))
    : [];
  const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.firstName]));
  const jobs = (await jobsByUser(db, [c.get("user").id], { includeInactive: true })).get(c.get("user").id) ?? [];
  const jobTitles = new Map(jobs.map((job) => [job.id, job.title]));
  return c.json(entries.map((entry) => ({
    ...entry,
    jobTitle: entry.jobId ? jobTitles.get(entry.jobId) ?? null : null,
    reviewedBy: entry.status === "PENDING" || !entry.editedById ? null : reviewerNames.get(entry.editedById) ?? null,
  })));
});

const jobChangeSchema = z.object({ jobId: z.number().int().positive() });

/**
 * "I clocked in for the wrong job": a student moves their own shift to another
 * of their jobs while it is still open or waiting for approval. Approved or
 * rejected shifts need a correction request instead.
 */
timeclockRoutes.patch("/my-entries/:id/job", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid entry id." });
  const { jobId } = jobChangeSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const entry = await db.query.timeEntries.findFirst({ where: and(eq(timeEntries.id, id), eq(timeEntries.userId, me.id)) });
  if (!entry) throw new HTTPException(404, { message: "Time entry not found." });
  if (entry.status !== "PENDING") {
    throw new HTTPException(409, { message: "This shift was already reviewed. Send a correction request instead." });
  }
  const job = await activeJobFor(db, me.id, jobId);
  await db.update(timeEntries).set({ jobId: job.id, chargeAccountId: job.chargeAccountId, updatedAt: new Date() }).where(eq(timeEntries.id, id));
  await writeAuditLog(c, "TIME_ENTRY_JOB_CHANGE", "TimeEntry", id, { from: entry.jobId, to: job.id });
  return c.json({ saved: true, jobTitle: job.title });
});

timeclockRoutes.get("/pending", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");

  // Supervisors see only students assigned to them. Enforced in the query, not
  // just hidden in the UI.
  const conditions = [eq(timeEntries.status, "PENDING" as const)];
  if (me.role !== "ADMIN") conditions.push(inArray(users.id, supervisedStudentIds(db, me.id)));

  const rows = await db
    .select({
      id: timeEntries.id,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      status: timeEntries.status,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      preferredName: users.preferredName,
      chargeAccountId: chargeAccounts.id,
      chargeAccountCode: chargeAccounts.code,
      chargeAccountName: chargeAccounts.name,
      jobTitle: studentJobs.title,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(chargeAccounts, eq(timeEntries.chargeAccountId, chargeAccounts.id))
    .leftJoin(studentJobs, eq(timeEntries.jobId, studentJobs.id))
    .where(and(...conditions))
    .orderBy(timeEntries.clockIn);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      // A shift is submitted for approval when the student clocks out.
      submittedAt: r.clockOut,
      status: r.status,
      chargeAccount: r.chargeAccountId ? { id: r.chargeAccountId, code: r.chargeAccountCode, name: r.chargeAccountName } : null,
      jobTitle: r.jobTitle,
      user: { id: r.userId, firstName: r.firstName, lastName: r.lastName, preferredName: r.preferredName, fullName: fullName(r) },
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
  await assertCanManageStudent(db, me, entry.userId);

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

  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry) throw new HTTPException(404, { message: "Time entry not found." });
  await assertCanManageStudent(db, me, entry.userId);

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

const chargeAccountChangeSchema = z.object({ chargeAccountId: z.number().int().positive() });

/**
 * Moves a shift to another charge account, e.g. hours worked for a grant that
 * were charged to the department. Any assigned supervisor or admin can do it,
 * before or after approval; reports pick up the change.
 */
timeclockRoutes.patch("/:id/charge-account", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid entry id." });
  const { chargeAccountId } = chargeAccountChangeSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry) throw new HTTPException(404, { message: "Time entry not found." });
  await assertCanManageStudent(db, c.get("user"), entry.userId);
  const account = await db.query.chargeAccounts.findFirst({ where: eq(chargeAccounts.id, chargeAccountId) });
  if (!account?.isActive) throw new HTTPException(422, { message: "Choose an active charge account." });
  await db.update(timeEntries).set({ chargeAccountId, updatedAt: new Date() }).where(eq(timeEntries.id, id));
  await writeAuditLog(c, "TIME_ENTRY_CHARGE_ACCOUNT", "TimeEntry", id, { from: entry.chargeAccountId, to: chargeAccountId });
  return c.json({ saved: true, chargeAccount: { id: account.id, code: account.code, name: account.name } });
});

const changeRequestSchema = z.object({
  timeEntryId: z.number().int().positive().nullable().optional(),
  jobId: z.number().int().positive().optional(),
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

  // A new missed shift from a student with several jobs must name the job.
  let jobId: number | null = null;
  if (!body.timeEntryId) {
    const jobs = (await jobsByUser(db, [me.id])).get(me.id) ?? [];
    if (jobs.length > 1 && !body.jobId) throw new HTTPException(422, { message: "Choose which job the missed shift was for." });
    jobId = body.jobId ? (await activeJobFor(db, me.id, body.jobId)).id : jobs[0]?.id ?? null;
  }

  const [request] = await db.insert(timeEntryChangeRequests).values({
    userId: me.id,
    timeEntryId: body.timeEntryId ?? null,
    jobId,
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
  // Pending requests can be approved by any assigned supervisor or any admin.
  const approvers = (await supervisorsByStudent(db, [c.get("user").id])).get(c.get("user").id) ?? [];

  return c.json(requests.map((request) => ({
    ...request,
    reviewerName: request.reviewerId ? reviewerNames.get(request.reviewerId) ?? null : null,
    waitingOn: request.status === "PENDING" ? approvers.map((approver) => approver.name) : [],
  })));
});

timeclockRoutes.get("/correction-requests/pending", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const conditions = [eq(timeEntryChangeRequests.status, "PENDING" as const)];
  if (me.role !== "ADMIN") conditions.push(inArray(users.id, supervisedStudentIds(db, me.id)));

  const rows = await db.select({
    id: timeEntryChangeRequests.id,
    timeEntryId: timeEntryChangeRequests.timeEntryId,
    requestedClockIn: timeEntryChangeRequests.requestedClockIn,
    requestedClockOut: timeEntryChangeRequests.requestedClockOut,
    reason: timeEntryChangeRequests.reason,
    createdAt: timeEntryChangeRequests.createdAt,
    currentClockIn: timeEntries.clockIn,
    currentClockOut: timeEntries.clockOut,
    userId: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    preferredName: users.preferredName,
    jobTitle: studentJobs.title,
  }).from(timeEntryChangeRequests)
    .innerJoin(users, eq(timeEntryChangeRequests.userId, users.id))
    .leftJoin(timeEntries, eq(timeEntryChangeRequests.timeEntryId, timeEntries.id))
    .leftJoin(studentJobs, eq(studentJobs.id, sql`coalesce(${timeEntryChangeRequests.jobId}, ${timeEntries.jobId})`))
    .where(and(...conditions))
    .orderBy(timeEntryChangeRequests.createdAt);

  return c.json(rows.map((row) => ({
    id: row.id,
    timeEntryId: row.timeEntryId,
    requestedClockIn: row.requestedClockIn,
    requestedClockOut: row.requestedClockOut,
    reason: row.reason,
    submittedAt: row.createdAt,
    jobTitle: row.jobTitle,
    currentClockIn: row.currentClockIn,
    currentClockOut: row.currentClockOut,
    user: { id: row.userId, firstName: row.firstName, lastName: row.lastName, preferredName: row.preferredName, fullName: fullName(row) },
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
  // Any assigned supervisor or any admin, not one primary approver.
  await assertCanManageStudent(db, me, owner.id);

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
    const job = request.jobId ? await db.query.studentJobs.findFirst({ where: eq(studentJobs.id, request.jobId) }) : undefined;
    if (request.timeEntryId) {
      await db.batch([
        db.update(timeEntries).set(entryValues).where(and(eq(timeEntries.id, request.timeEntryId), eq(timeEntries.userId, request.userId))),
        db.update(timeEntryChangeRequests).set(review).where(eq(timeEntryChangeRequests.id, id)),
      ]);
    } else {
      await db.batch([
        db.insert(timeEntries).values({ userId: request.userId, jobId: request.jobId, chargeAccountId: job?.chargeAccountId ?? owner.chargeAccountId, ...entryValues }),
        db.update(timeEntryChangeRequests).set(review).where(eq(timeEntryChangeRequests.id, id)),
      ]);
    }
  } else {
    await db.update(timeEntryChangeRequests).set(review).where(eq(timeEntryChangeRequests.id, id));
  }

  await writeAuditLog(c, `TIME_CORRECTION_${body.status}`, "TimeEntryChangeRequest", id, { reason: body.reviewerReason ?? null });
  return c.json({ saved: true });
});
