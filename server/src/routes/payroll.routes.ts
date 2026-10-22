import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "../db/index.js";
import { chargeAccounts, departments, payPeriods, payStubs, users } from "../db/schema.js";
import { centsToDollarString, minutesToHourString } from "../lib/money.js";
import { buildPdf, type PdfLine, type PdfRule } from "../lib/pdf.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { finalizePayPeriod, generatePayStubsForPeriod } from "../services/payroll.service.js";
import { writeAuditLog } from "../services/audit.service.js";
import { sendApprovalReminders } from "../services/reminder.service.js";
import { emailNotification } from "../services/email.service.js";
import { assertCanManageStudent, fullName, isAssignedSupervisor, supervisedStudentIds } from "../services/access.service.js";
import type { AppEnv } from "../types.js";

export const payrollRoutes = new Hono<AppEnv>();

payrollRoutes.use("*", requireAuth);

payrollRoutes.get("/periods", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const periods = await db
    .select()
    .from(payPeriods)
    .orderBy(desc(payPeriods.startDate))
    .limit(50);

  // Supervisors count only stubs for students assigned to them.
  const result = me.role === "SUPERVISOR"
    ? await c.env.DB.prepare(`
        SELECT s.pay_period_id, COUNT(*) AS row_count
        FROM pay_stubs s
        JOIN student_supervisors ss ON ss.student_id = s.user_id AND ss.supervisor_id = ?
        GROUP BY s.pay_period_id
      `).bind(me.id).all<{ pay_period_id: number; row_count: number }>()
    : await c.env.DB.prepare(`
        SELECT pay_period_id, COUNT(*) AS row_count
        FROM pay_stubs GROUP BY pay_period_id
      `).all<{ pay_period_id: number; row_count: number }>();
  const countsByPeriod = new Map(result.results.map((row) => [row.pay_period_id, row.row_count]));
  return c.json(periods.map((period) => ({ ...period, reportRowCount: countsByPeriod.get(period.id) ?? 0 })));
});

const createPeriodSchema = z.object({
  type: z.enum(["BIWEEKLY", "MONTHLY"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  payDate: z.string().datetime(),
});

payrollRoutes.post("/periods", requireRole("ADMIN"), async (c) => {
  const body = createPeriodSchema.parse(await c.req.json());
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (endDate <= startDate) {
    throw new HTTPException(400, { message: "endDate must be after startDate." });
  }

  const db = getDb(c.env.DB);
  const [period] = await db
    .insert(payPeriods)
    .values({ type: body.type, startDate, endDate, payDate: new Date(body.payDate) })
    .returning();

  await writeAuditLog(c, "PAY_PERIOD_CREATE", "PayPeriod", period.id);
  return c.json(period, 201);
});

payrollRoutes.post("/periods/:id/generate", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid pay period id." });

  const db = getDb(c.env.DB);
  const result = await generatePayStubsForPeriod(db, id);

  await writeAuditLog(c, "PAY_STUBS_GENERATE", "PayPeriod", id, { count: result.generated });
  return c.json(result);
});

payrollRoutes.post("/periods/:id/finalize", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid pay period id." });

  const db = getDb(c.env.DB);
  const period = await finalizePayPeriod(db, id, c.get("user").id);
  if (!period) throw new HTTPException(404, { message: "Pay period not found." });

  await writeAuditLog(c, "PAY_PERIOD_FINALIZE", "PayPeriod", id);
  return c.json(period);
});

/**
 * Sends each supervisor one summary of their students' time waiting for
 * approval, right now. The scheduled deadline reminders do this
 * automatically; this is for an admin who wants to nudge mid-period.
 */
payrollRoutes.post("/reminders", requireRole("ADMIN"), async (c) => {
  const result = await sendApprovalReminders(c.env, { stage: "deadline-morning", deadline: null, payType: null, cutoff: null });
  await writeAuditLog(c, "APPROVAL_REMINDERS_SEND", "PayPeriod", undefined, { ...result });
  return c.json(result);
});

/** First names for a set of user ids, for "Reviewed by" style attributions. */
async function firstNames(db: Db, ids: (number | null)[]) {
  const unique = [...new Set(ids.filter((id): id is number => id !== null))];
  const rows = unique.length
    ? await db.select({ id: users.id, firstName: users.firstName, preferredName: users.preferredName }).from(users).where(inArray(users.id, unique))
    : [];
  return new Map(rows.map((row) => [row.id, row.preferredName || row.firstName]));
}

const stubColumns = {
  id: payStubs.id,
  userId: payStubs.userId,
  payPeriodId: payStubs.payPeriodId,
  regularMinutes: payStubs.regularMinutes,
  overtimeMinutes: payStubs.overtimeMinutes,
  hourlyRateCents: payStubs.hourlyRateCents,
  regularPayCents: payStubs.regularPayCents,
  overtimePayCents: payStubs.overtimePayCents,
  grossPayCents: payStubs.grossPayCents,
  status: payStubs.status,
  finalizedById: payStubs.finalizedById,
  reviewStatus: payStubs.reviewStatus,
  reviewedById: payStubs.reviewedById,
  reviewReason: payStubs.reviewReason,
  flagNote: payStubs.flagNote,
  flaggedById: payStubs.flaggedById,
  flaggedAt: payStubs.flaggedAt,
  flagResolvedAt: payStubs.flagResolvedAt,
  flagResolution: payStubs.flagResolution,
  startDate: payPeriods.startDate,
  endDate: payPeriods.endDate,
  payDate: payPeriods.payDate,
  periodType: payPeriods.type,
};

/** Stubs joined to their pay period; callers add filters and extra columns. */
function selectStubs(db: Db) {
  return db.select(stubColumns).from(payStubs).innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id));
}

type StubRow = Awaited<ReturnType<typeof selectStubs>>[number];

/** The API speaks dollars and hours; cents and minutes are a storage detail. */
function serializeStub(row: StubRow, names: Map<number, string>) {
  const flagOpen = row.flagNote !== null && row.flagResolvedAt === null;
  return {
    id: row.id,
    regularHours: minutesToHourString(row.regularMinutes),
    overtimeHours: minutesToHourString(row.overtimeMinutes),
    totalHours: minutesToHourString(row.regularMinutes + row.overtimeMinutes),
    hourlyRate: row.hourlyRateCents === null ? null : centsToDollarString(row.hourlyRateCents),
    regularPay: centsToDollarString(row.regularPayCents),
    overtimePay: centsToDollarString(row.overtimePayCents),
    grossPay: centsToDollarString(row.grossPayCents),
    status: row.status,
    processedBy: row.finalizedById ? names.get(row.finalizedById) ?? null : null,
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedById ? names.get(row.reviewedById) ?? null : null,
    reviewReason: row.reviewReason,
    flag: row.flagNote === null ? null : {
      note: row.flagNote,
      open: flagOpen,
      flaggedBy: row.flaggedById ? names.get(row.flaggedById) ?? null : null,
      flaggedAt: row.flaggedAt,
      resolution: row.flagResolution,
    },
    payPeriod: { id: row.payPeriodId, type: row.periodType, startDate: row.startDate, endDate: row.endDate, payDate: row.payDate },
  };
}

/** The signed-in user's own stubs: a plain list with no review actions. */
payrollRoutes.get("/my-stubs", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await selectStubs(db)
    .where(eq(payStubs.userId, c.get("user").id))
    .orderBy(desc(payPeriods.startDate));

  const names = await firstNames(db, rows.flatMap((row) => [row.finalizedById, row.reviewedById, row.flaggedById]));
  return c.json(rows.map((row) => serializeStub(row, names)));
});

/**
 * Student stubs for review. Admins see every student; supervisors see the
 * students assigned to them. Never includes the reviewer's own stub.
 */
payrollRoutes.get("/team-stubs", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const conditions = [eq(users.role, "STUDENT" as const), ne(users.id, me.id)];
  if (me.role !== "ADMIN") conditions.push(inArray(users.id, supervisedStudentIds(db, me.id)));

  const rows = await db.select({
    ...stubColumns,
    firstName: users.firstName,
    lastName: users.lastName,
    preferredName: users.preferredName,
    departmentName: departments.name,
    chargeAccountCode: chargeAccounts.code,
  }).from(payStubs)
    .innerJoin(users, eq(payStubs.userId, users.id))
    .innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(chargeAccounts, eq(users.chargeAccountId, chargeAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(payPeriods.startDate), users.lastName, users.firstName);

  const names = await firstNames(db, rows.flatMap((row) => [row.finalizedById, row.reviewedById, row.flaggedById]));
  return c.json(rows.map((row) => ({
    ...serializeStub(row, names),
    employeeId: row.userId,
    employeeName: fullName(row),
    firstName: row.firstName,
    lastName: row.lastName,
    preferredName: row.preferredName,
    department: row.departmentName,
    chargeAccount: row.chargeAccountCode,
  })));
});

const stubReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.status === "REJECTED" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required when rejecting a pay stub." });
  }
});

/** Loads a stub and checks the caller may review it (student stub, not their own). */
async function reviewableStub(db: Db, me: AppEnv["Variables"]["user"], id: number) {
  const row = await db.select({ id: payStubs.id, userId: payStubs.userId, role: users.role })
    .from(payStubs)
    .innerJoin(users, eq(payStubs.userId, users.id))
    .where(eq(payStubs.id, id))
    .get();
  if (!row) throw new HTTPException(404, { message: "Pay stub not found." });
  if (row.role !== "STUDENT" || row.userId === me.id) {
    throw new HTTPException(403, { message: "Only student pay stubs are reviewed here." });
  }
  await assertCanManageStudent(db, me, row.userId);
  return row;
}

payrollRoutes.patch("/team-stubs/:id/review", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid pay stub id." });

  const body = stubReviewSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const row = await reviewableStub(db, me, id);

  const [updated] = await db.update(payStubs).set({
    reviewStatus: body.status,
    reviewedById: me.id,
    reviewedAt: new Date(),
    reviewReason: body.status === "REJECTED" ? body.reason : null,
  }).where(and(eq(payStubs.id, id), eq(payStubs.userId, row.userId))).returning();

  await writeAuditLog(c, `PAY_STUB_${body.status}`, "PayStub", id, { reason: body.reason ?? null });
  if (body.status === "REJECTED") {
    // Admins have to fix a rejected stub, so this one is worth an email.
    const student = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));
    for (const admin of admins) {
      await emailNotification(c, admin.id, "PAY_STUB_REJECTED", {
        subject: `Pay stub rejected: ${student ? fullName(student) : "a student"}`,
        heading: "A pay stub needs fixing",
        paragraphs: [`A supervisor rejected the pay stub for ${student ? fullName(student) : "a student"}.`, `Reason: ${body.reason}`],
        button: { label: "Open Talon", path: "/" },
      });
    }
  }
  return c.json({ ...updated, reviewedBy: (await firstNames(db, [me.id])).get(me.id) ?? null });
});

const batchReviewSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

/** Approves several stubs at once. Rejections stay one at a time because each needs a reason. */
payrollRoutes.post("/team-stubs/approve", requireRole("SUPERVISOR"), async (c) => {
  const { ids } = batchReviewSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const unique = [...new Set(ids)];

  const rows = await db.select({ id: payStubs.id, userId: payStubs.userId, role: users.role })
    .from(payStubs)
    .innerJoin(users, eq(payStubs.userId, users.id))
    .where(inArray(payStubs.id, unique));
  if (rows.length !== unique.length) throw new HTTPException(404, { message: "One or more pay stubs were not found." });
  if (rows.some((row) => row.role !== "STUDENT" || row.userId === me.id)) {
    throw new HTTPException(403, { message: "Only student pay stubs are reviewed here." });
  }
  if (me.role !== "ADMIN") {
    const allowed = new Set((await supervisedStudentIds(db, me.id)).map((row) => row.id));
    if (rows.some((row) => !allowed.has(row.userId))) {
      throw new HTTPException(403, { message: "You are not assigned to every selected student." });
    }
  }

  await db.update(payStubs).set({ reviewStatus: "APPROVED", reviewedById: me.id, reviewedAt: new Date(), reviewReason: null })
    .where(inArray(payStubs.id, unique));
  await writeAuditLog(c, "PAY_STUB_BATCH_APPROVED", "PayStub", undefined, { ids: unique });
  return c.json({ approved: unique.length });
});

const flagSchema = z.object({ note: z.string().trim().min(3, "Describe the question.").max(500) });

/**
 * Raises a question on a student's stub so it can be discussed in Talon
 * instead of by email. Any admin or assigned supervisor can ask or answer.
 */
payrollRoutes.post("/stubs/:id/flag", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid pay stub id." });
  const { note } = flagSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");
  await reviewableStub(db, me, id);

  await db.update(payStubs).set({
    flagNote: note,
    flaggedById: me.id,
    flaggedAt: new Date(),
    flagResolvedAt: null,
    flagResolution: null,
  }).where(eq(payStubs.id, id));
  await writeAuditLog(c, "PAY_STUB_FLAG", "PayStub", id, { note });
  return c.json({ saved: true });
});

const resolveSchema = z.object({ resolution: z.string().trim().min(3, "Explain how the question was answered.").max(500) });

payrollRoutes.post("/stubs/:id/resolve-flag", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid pay stub id." });
  const { resolution } = resolveSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const stub = await db.query.payStubs.findFirst({ where: eq(payStubs.id, id) });
  if (!stub?.flagNote) throw new HTTPException(404, { message: "That pay stub has no open question." });
  await assertCanManageStudent(db, c.get("user"), stub.userId);

  await db.update(payStubs).set({ flagResolvedAt: new Date(), flagResolution: resolution }).where(eq(payStubs.id, id));
  await writeAuditLog(c, "PAY_STUB_FLAG_RESOLVE", "PayStub", id, { resolution });
  return c.json({ saved: true });
});

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** A printable PDF of one stub, for its owner, an assigned supervisor, or an admin. */
payrollRoutes.get("/stubs/:id/pdf", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid pay stub id." });
  const db = getDb(c.env.DB);
  const me = c.get("user");

  const row = await db.select({
    ...stubColumns,
    firstName: users.firstName,
    lastName: users.lastName,
    preferredName: users.preferredName,
    email: users.email,
    payType: users.payType,
    departmentName: departments.name,
  }).from(payStubs)
    .innerJoin(users, eq(payStubs.userId, users.id))
    .innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(payStubs.id, id))
    .get();
  if (!row) throw new HTTPException(404, { message: "Pay stub not found." });
  if (row.userId !== me.id) {
    const allowed = me.role === "ADMIN" || (me.role === "SUPERVISOR" && (await isAssignedSupervisor(db, me.id, row.userId)));
    if (!allowed) throw new HTTPException(404, { message: "Pay stub not found." });
  }

  const names = await firstNames(db, [row.finalizedById, row.reviewedById]);
  const stub = serializeStub(row, names);
  const lines: PdfLine[] = [
    { text: "Tennessee Tech University", x: 54, y: 60, size: 11, bold: true },
    { text: "Pay Stub", x: 54, y: 84, size: 20, bold: true },
    { text: `Pay date ${formatDate(row.payDate)}`, x: 558, y: 84, size: 11, alignRight: true },
    { text: "Employee", x: 54, y: 124, size: 9, bold: true },
    { text: fullName(row), x: 54, y: 140, size: 12 },
    { text: row.email, x: 54, y: 156 },
    { text: row.departmentName ?? "No department", x: 54, y: 170 },
    { text: "Pay period", x: 330, y: 124, size: 9, bold: true },
    { text: `${formatDate(row.startDate)} - ${formatDate(row.endDate)}`, x: 330, y: 140, size: 12 },
    { text: `${row.periodType === "BIWEEKLY" ? "Bi-weekly" : "Monthly"} · ${row.hourlyRateCents === null ? "Salaried" : `$${stub.hourlyRate} per hour`}`, x: 330, y: 156 },
    { text: "Earnings", x: 54, y: 214, bold: true },
    { text: "Hours", x: 360, y: 214, bold: true, alignRight: true },
    { text: "Rate", x: 450, y: 214, bold: true, alignRight: true },
    { text: "Amount", x: 558, y: 214, bold: true, alignRight: true },
    { text: "Regular", x: 54, y: 238 },
    { text: stub.regularHours, x: 360, y: 238, alignRight: true },
    { text: stub.hourlyRate === null ? "-" : `$${stub.hourlyRate}`, x: 450, y: 238, alignRight: true },
    { text: `$${stub.regularPay}`, x: 558, y: 238, alignRight: true },
    { text: "Overtime (1.5x)", x: 54, y: 258 },
    { text: stub.overtimeHours, x: 360, y: 258, alignRight: true },
    { text: row.hourlyRateCents === null ? "-" : `$${centsToDollarString(Math.round(row.hourlyRateCents * 1.5))}`, x: 450, y: 258, alignRight: true },
    { text: `$${stub.overtimePay}`, x: 558, y: 258, alignRight: true },
    { text: "Total", x: 54, y: 290, bold: true },
    { text: stub.totalHours, x: 360, y: 290, bold: true, alignRight: true },
    { text: `$${stub.grossPay}`, x: 558, y: 290, bold: true, alignRight: true },
    { text: `Payroll status: ${stub.status}${stub.processedBy ? ` (processed by ${stub.processedBy})` : ""}`, x: 54, y: 336 },
    { text: `Review status: ${stub.reviewStatus}${stub.reviewedBy ? ` (reviewed by ${stub.reviewedBy})` : ""}`, x: 54, y: 352 },
    { text: "Gross pay before taxes and deductions. Generated by Talon.", x: 54, y: 740, size: 8 },
  ];
  const rules: PdfRule[] = [
    { x1: 54, y1: 100, x2: 558, y2: 100 },
    { x1: 54, y1: 222, x2: 558, y2: 222 },
    { x1: 54, y1: 274, x2: 558, y2: 274 },
  ];

  const filename = `paystub-${row.lastName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${row.payDate.toISOString().slice(0, 10)}.pdf`;
  await writeAuditLog(c, "PAY_STUB_DOWNLOAD", "PayStub", id);
  return new Response(buildPdf(`Pay stub ${fullName(row)}`, lines, rules), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
