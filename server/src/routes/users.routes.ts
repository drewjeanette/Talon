import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { departments, refreshTokens, users } from "../db/schema.js";
import { generateTempPassword, hashPassword } from "../lib/password.js";
import { centsToDollarString, dollarsToCents } from "../lib/money.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
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

userRoutes.get("/", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const departmentId = c.req.query("departmentId");

  const conditions = [];
  if (me.role === "ADMIN") {
    if (departmentId) conditions.push(eq(users.departmentId, Number(departmentId)));
  } else {
    // Supervisors see their direct reports only.
    conditions.push(eq(users.supervisorId, me.id));
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      payType: users.payType,
      hourlyRateCents: users.hourlyRateCents,
      isActive: users.isActive,
      departmentId: departments.id,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(users.lastName), asc(users.firstName));

  return c.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      role: r.role,
      payType: r.payType,
      hourlyRate: r.hourlyRateCents === null ? null : centsToDollarString(r.hourlyRateCents),
      isActive: r.isActive,
      department: r.departmentId ? { id: r.departmentId, name: r.departmentName } : null,
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
  if (target.role !== "STUDENT" || target.payType !== "BIWEEKLY") {
    throw new HTTPException(422, { message: "Hourly rates can only be set for biweekly student employees." });
  }
  if (me.role === "SUPERVISOR" && target.supervisorId !== me.id) {
    throw new HTTPException(403, { message: "You do not supervise this student." });
  }

  const hourlyRateCents = dollarsToCents(hourlyRate);
  await db.update(users).set({ hourlyRateCents, updatedAt: new Date() }).where(eq(users.id, id));
  await writeAuditLog(c, "HOURLY_RATE_UPDATE", "User", id, { hourlyRateCents });
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
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(["STUDENT", "SUPERVISOR", "ADMIN"]),
    payType: z.enum(["BIWEEKLY", "MONTHLY"]),
    departmentId: z.number().int().optional(),
    supervisorId: z.number().int().optional(),
    hourlyRate: z.number().positive().optional(),
    annualSalary: z.number().positive().optional(),
  })
  .refine((d) => (d.payType === "BIWEEKLY" ? d.hourlyRate !== undefined : d.annualSalary !== undefined), {
    message: "Biweekly employees need an hourly rate; monthly employees need an annual salary.",
  });

/**
 * Admin-only provisioning. A one-time random password is generated and returned
 * once so it can be delivered out of band; it is never emailed or stored in
 * plaintext, and the account is flagged to force a reset on first login.
 */
userRoutes.post("/", requireRole("ADMIN"), async (c) => {
  const data = createUserSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      payType: data.payType,
      departmentId: data.departmentId ?? null,
      supervisorId: data.supervisorId ?? null,
      hourlyRateCents: data.hourlyRate !== undefined ? dollarsToCents(data.hourlyRate) : null,
      annualSalaryCents: data.annualSalary !== undefined ? dollarsToCents(data.annualSalary) : null,
      passwordHash,
      mustResetPw: true,
    })
    .returning();

  await writeAuditLog(c, "USER_CREATE", "User", user.id);
  return c.json({ id: user.id, email: user.email, tempPassword }, 201);
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
