import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { chargeAccounts, colleges, departments } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import type { AppEnv } from "../types.js";

export const orgRoutes = new Hono<AppEnv>();

orgRoutes.use("*", requireAuth);

orgRoutes.get("/colleges", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.query.colleges.findMany({
    with: {
      departments: { columns: { id: true, name: true, code: true, isActive: true } },
    },
    orderBy: asc(colleges.name),
  });
  return c.json(rows);
});

const collegeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
});

orgRoutes.post("/colleges", requireRole("ADMIN"), async (c) => {
  const data = collegeSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const [college] = await db.insert(colleges).values(data).returning();
  await writeAuditLog(c, "COLLEGE_CREATE", "College", college.id);
  return c.json(college, 201);
});

orgRoutes.get("/departments", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: departments.id,
      code: departments.code,
      name: departments.name,
      isActive: departments.isActive,
      collegeId: colleges.id,
      collegeName: colleges.name,
    })
    .from(departments)
    .leftJoin(colleges, eq(departments.collegeId, colleges.id))
    .orderBy(asc(departments.code));

  return c.json(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isActive: r.isActive,
      college: r.collegeId ? { id: r.collegeId, name: r.collegeName } : null,
    }))
  );
});

const createDepartmentSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1),
  collegeId: z.number().int().nullable().optional(),
});

// Department codes are data, not source code: admins add, rename, reassign and
// retire them here rather than a developer editing a hardcoded list.
orgRoutes.post("/departments", requireRole("ADMIN"), async (c) => {
  const data = createDepartmentSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const [department] = await db
    .insert(departments)
    .values({ code: data.code, name: data.name, collegeId: data.collegeId ?? null })
    .returning();

  await writeAuditLog(c, "DEPARTMENT_CREATE", "Department", department.id);
  return c.json(department, 201);
});

const updateDepartmentSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).optional(),
  collegeId: z.number().int().nullable().optional(),
  isActive: z.boolean().optional(),
});

orgRoutes.patch("/departments/:id", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid department id." });

  const data = updateDepartmentSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);

  const [department] = await db
    .update(departments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(departments.id, id))
    .returning();

  if (!department) throw new HTTPException(404, { message: "Department not found." });

  await writeAuditLog(c, "DEPARTMENT_UPDATE", "Department", id, data);
  return c.json(department);
});

// Charge accounts (Banner "index"). Any signed-in user may read the list for
// labels; only admins change it.
orgRoutes.get("/charge-accounts", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: chargeAccounts.id,
      code: chargeAccounts.code,
      name: chargeAccounts.name,
      isActive: chargeAccounts.isActive,
      departmentId: departments.id,
      departmentName: departments.name,
      departmentCode: departments.code,
    })
    .from(chargeAccounts)
    .leftJoin(departments, eq(chargeAccounts.departmentId, departments.id))
    .orderBy(asc(chargeAccounts.code));

  return c.json(rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isActive: r.isActive,
    department: r.departmentId ? { id: r.departmentId, name: r.departmentName, code: r.departmentCode } : null,
  })));
});

const chargeAccountSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  departmentId: z.number().int().nullable().optional(),
});

orgRoutes.post("/charge-accounts", requireRole("ADMIN"), async (c) => {
  const data = chargeAccountSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const [account] = await db
    .insert(chargeAccounts)
    .values({ code: data.code, name: data.name, departmentId: data.departmentId ?? null })
    .returning();
  await writeAuditLog(c, "CHARGE_ACCOUNT_CREATE", "ChargeAccount", account.id);
  return c.json(account, 201);
});

const updateChargeAccountSchema = chargeAccountSchema.partial().extend({ isActive: z.boolean().optional() });

orgRoutes.patch("/charge-accounts/:id", requireRole("ADMIN"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid charge account id." });
  const data = updateChargeAccountSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const [account] = await db
    .update(chargeAccounts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(chargeAccounts.id, id))
    .returning();
  if (!account) throw new HTTPException(404, { message: "Charge account not found." });
  await writeAuditLog(c, "CHARGE_ACCOUNT_UPDATE", "ChargeAccount", id, data);
  return c.json(account);
});
