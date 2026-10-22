import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { chargeAccounts, departments, refreshTokens, studentJobs, studentSupervisors, users } from "../db/schema.js";
import { generateTempPassword, hashPassword } from "../lib/password.js";
import { centsToDollarString, dollarsToCents } from "../lib/money.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import { jobsByUser, syncDefaultAccount } from "../services/jobs.service.js";
import { assertCanManageStudent, fullName, supervisedStudentIds, supervisorsByStudent } from "../services/access.service.js";
import type { AppEnv } from "../types.js";

export const userRoutes = new Hono<AppEnv>();

userRoutes.use("*", requireAuth);

userRoutes.get("/me/pay-rate", async (c) => {
  const db = getDb(c.env.DB);
  const user = await db.query.users.findFirst({ where: eq(users.id, c.get("user").id) });
  if (!user) throw new HTTPException(404, { message: "User not found." });
  return c.json({
    payType: user.payType,
    hourlyRate: user.hourlyRateCents === null ? null : centsToDollarString(user.hourlyRateCents),
  });
});

/** Who the signed-in student's requests wait on, for "waiting on" status. */
userRoutes.get("/me/approvers", async (c) => {
  const db = getDb(c.env.DB);
  const approvers = (await supervisorsByStudent(db, [c.get("user").id])).get(c.get("user").id) ?? [];
  return c.json({ supervisors: approvers.map((approver) => approver.name) });
});

userRoutes.get("/", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const departmentId = c.req.query("departmentId");

  const conditions = [];
  if (me.role === "ADMIN") {
    if (departmentId) conditions.push(eq(users.departmentId, Number(departmentId)));
  } else {
    // Supervisors see only the students assigned to them.
    conditions.push(inArray(users.id, supervisedStudentIds(db, me.id)));
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      preferredName: users.preferredName,
      role: users.role,
      payType: users.payType,
      hourlyRateCents: users.hourlyRateCents,
      isActive: users.isActive,
      departmentId: departments.id,
      departmentName: departments.name,
      departmentCode: departments.code,
      chargeAccountId: chargeAccounts.id,
      chargeAccountCode: chargeAccounts.code,
      chargeAccountName: chargeAccounts.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(chargeAccounts, eq(users.chargeAccountId, chargeAccounts.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(users.lastName), asc(users.firstName));

  const studentIds = rows.filter((r) => r.role === "STUDENT").map((r) => r.id);
  const [supervisors, jobs] = await Promise.all([supervisorsByStudent(db, studentIds), jobsByUser(db, studentIds)]);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      preferredName: r.preferredName,
      fullName: fullName(r),
      role: r.role,
      payType: r.payType,
      hourlyRate: r.hourlyRateCents === null ? null : centsToDollarString(r.hourlyRateCents),
      isActive: r.isActive,
      department: r.departmentId ? { id: r.departmentId, name: r.departmentName, code: r.departmentCode } : null,
      chargeAccount: r.chargeAccountId ? { id: r.chargeAccountId, code: r.chargeAccountCode, name: r.chargeAccountName } : null,
      supervisors: (supervisors.get(r.id) ?? []).map(({ id, name }) => ({ id, name })),
      jobs: jobs.get(r.id) ?? [],
    }))
  );
});

const hourlyRateSchema = z.object({
  hourlyRate: z.number().positive().max(1000).multipleOf(0.01),
});

userRoutes.patch("/:id/hourly-rate", requireRole("SUPERVISOR"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid user id." });
  const { hourlyRate } = hourlyRateSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) throw new HTTPException(404, { message: "Student not found." });
  if (target.role !== "STUDENT") {
    throw new HTTPException(422, { message: "Hourly rates can only be set for student employees." });
  }
  await assertCanManageStudent(db, me, id);

  const hourlyRateCents = dollarsToCents(hourlyRate);
  await db.update(users).set({ hourlyRateCents, updatedAt: new Date() }).where(eq(users.id, id));
  await writeAuditLog(c, "HOURLY_RATE_UPDATE", "User", id, { from: target.hourlyRateCents, hourlyRateCents });
  return c.json({ id, hourlyRate: centsToDollarString(hourlyRateCents) });
});

const createUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .refine((email) => email.endsWith("@tntech.edu"), {
        message: "Use a Tennessee Tech email ending in @tntech.edu.",
      }),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    preferredName: z.string().trim().max(60).optional(),
    role: z.enum(["STUDENT", "SUPERVISOR", "ADMIN"]),
    payType: z.enum(["BIWEEKLY", "MONTHLY"]),
    departmentId: z.number().int().optional(),
    chargeAccountId: z.number().int().optional(),
    jobTitle: z.string().trim().min(1).max(80).optional(),
    supervisorIds: z.array(z.number().int()).max(20).optional(),
    hourlyRate: z.number().positive().optional(),
    annualSalary: z.number().positive().optional(),
  })
  .refine((d) => (d.payType === "BIWEEKLY" ? d.hourlyRate !== undefined : d.hourlyRate !== undefined || d.annualSalary !== undefined), {
    message: "Biweekly employees need an hourly rate; monthly employees need an hourly rate or an annual salary.",
  });

/** Rejects ids that are not active supervisors, so a student can't be assigned to another student. */
async function assertSupervisorIds(db: ReturnType<typeof getDb>, ids: number[]) {
  if (ids.length === 0) return;
  const found = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, ids), inArray(users.role, ["SUPERVISOR", "ADMIN"]), eq(users.isActive, true)));
  if (found.length !== new Set(ids).size) throw new HTTPException(422, { message: "Choose supervisors from the supervisor list." });
}

/**
 * Admin-only provisioning. A one-time random password is generated and returned
 * once so it can be delivered out of band; it is never emailed or stored in
 * plaintext, and the account is flagged to force a reset on first login.
 */
userRoutes.post("/", requireRole("ADMIN"), async (c) => {
  const data = createUserSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const supervisorIds = data.role === "STUDENT" ? [...new Set(data.supervisorIds ?? [])] : [];
  await assertSupervisorIds(db, supervisorIds);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      preferredName: data.preferredName || null,
      role: data.role,
      payType: data.payType,
      departmentId: data.departmentId ?? null,
      chargeAccountId: data.chargeAccountId ?? null,
      hourlyRateCents: data.hourlyRate !== undefined ? dollarsToCents(data.hourlyRate) : null,
      annualSalaryCents: data.annualSalary !== undefined ? dollarsToCents(data.annualSalary) : null,
      passwordHash,
      mustResetPw: true,
    })
    .returning();
  if (supervisorIds.length) {
    await db.insert(studentSupervisors).values(supervisorIds.map((supervisorId) => ({ studentId: user.id, supervisorId })));
  }
  if (data.role === "STUDENT") {
    await db.insert(studentJobs).values({ userId: user.id, title: data.jobTitle ?? "Student worker", chargeAccountId: data.chargeAccountId ?? null });
  }

  await writeAuditLog(c, "USER_CREATE", "User", user.id);
  return c.json({ id: user.id, email: user.email, tempPassword }, 201);
});

const updateUserSchema = z.object({
  preferredName: z.string().trim().max(60).nullable().optional(),
  departmentId: z.number().int().nullable().optional(),
  supervisorIds: z.array(z.number().int()).max(20).optional(),
}).strict();

/** Admin edits to a person's job details and supervisor assignments. */
userRoutes.patch("/:id", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid user id." });
  const data = updateUserSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) throw new HTTPException(404, { message: "User not found." });

  const { supervisorIds, ...fields } = data;
  if (supervisorIds !== undefined) {
    if (target.role !== "STUDENT") throw new HTTPException(422, { message: "Only students have supervisors." });
    const unique = [...new Set(supervisorIds)].filter((supervisorId) => supervisorId !== id);
    await assertSupervisorIds(db, unique);
    await db.batch([
      db.delete(studentSupervisors).where(eq(studentSupervisors.studentId, id)),
      ...unique.map((supervisorId) => db.insert(studentSupervisors).values({ studentId: id, supervisorId })),
    ]);
  }
  if (Object.keys(fields).length) {
    await db.update(users).set({
      ...fields,
      ...(fields.preferredName !== undefined ? { preferredName: fields.preferredName || null } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, id));
  }

  await writeAuditLog(c, "USER_UPDATE", "User", id, data);
  return c.json({ saved: true });
});

const jobSchema = z.object({
  title: z.string().trim().min(1).max(80),
  chargeAccountId: z.number().int().positive().nullable(),
});

/** Adds a job for a student (admin). Students with two or more pick one at clock-in. */
userRoutes.post("/:id/jobs", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid user id." });
  const data = jobSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (target?.role !== "STUDENT") throw new HTTPException(422, { message: "Only students have jobs." });
  const [job] = await db.insert(studentJobs).values({ userId: id, ...data }).returning();
  await syncDefaultAccount(db, id);
  await writeAuditLog(c, "STUDENT_JOB_CREATE", "StudentJob", job.id, data);
  return c.json(job, 201);
});

/** Renames, re-accounts, or ends a job (admin). Ended jobs keep their history. */
userRoutes.patch("/:id/jobs/:jobId", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  const jobId = Number(c.req.param("jobId"));
  if (!Number.isInteger(id) || !Number.isInteger(jobId)) throw new HTTPException(400, { message: "Invalid id." });
  const data = jobSchema.partial().extend({ isActive: z.boolean().optional() }).parse(await c.req.json());
  const db = getDb(c.env.DB);
  const [job] = await db.update(studentJobs).set({ ...data, updatedAt: new Date() })
    .where(and(eq(studentJobs.id, jobId), eq(studentJobs.userId, id))).returning();
  if (!job) throw new HTTPException(404, { message: "Job not found." });
  await syncDefaultAccount(db, id);
  await writeAuditLog(c, "STUDENT_JOB_UPDATE", "StudentJob", jobId, data);
  return c.json(job);
});

userRoutes.patch("/:id/deactivate", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid user id." });

  const db = getDb(c.env.DB);
  await db.batch([
    db.update(users).set({ isActive: false }).where(eq(users.id, id)),
    db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt))),
  ]);

  await writeAuditLog(c, "USER_DEACTIVATE", "User", id);
  return c.body(null, 204);
});
