import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { payPeriods, payStubs, users } from "../db/schema.js";
import { centsToDollarString, minutesToHourString } from "../lib/money.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { finalizePayPeriod, generatePayStubsForPeriod } from "../services/payroll.service.js";
import { writeAuditLog } from "../services/audit.service.js";
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

  let counts: { pay_period_id: number; row_count: number }[];
  if (me.role === "SUPERVISOR") {
    const supervisor = await db.query.users.findFirst({ where: eq(users.id, me.id) });
    if (!supervisor?.departmentId) {
      counts = [];
    } else {
      const result = await c.env.DB.prepare(`
        SELECT s.pay_period_id, COUNT(*) AS row_count
        FROM pay_stubs s
        JOIN users u ON u.id = s.user_id
        WHERE u.department_id = ?
        GROUP BY s.pay_period_id
      `).bind(supervisor.departmentId).all<{ pay_period_id: number; row_count: number }>();
      counts = result.results;
    }
  } else {
    const result = await c.env.DB.prepare(`
      SELECT pay_period_id, COUNT(*) AS row_count
      FROM pay_stubs GROUP BY pay_period_id
    `).all<{ pay_period_id: number; row_count: number }>();
    counts = result.results;
  }
  const countsByPeriod = new Map(counts.map((row) => [row.pay_period_id, row.row_count]));
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

payrollRoutes.get("/my-stubs", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: payStubs.id,
      regularMinutes: payStubs.regularMinutes,
      overtimeMinutes: payStubs.overtimeMinutes,
      grossPayCents: payStubs.grossPayCents,
      status: payStubs.status,
      finalizedById: payStubs.finalizedById,
      startDate: payPeriods.startDate,
      endDate: payPeriods.endDate,
      payDate: payPeriods.payDate,
    })
    .from(payStubs)
    .innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id))
    .where(eq(payStubs.userId, c.get("user").id))
    .orderBy(desc(payPeriods.startDate));

  const processorIds = [...new Set(rows.map((row) => row.finalizedById).filter((id): id is number => id !== null))];
  const processors = processorIds.length
    ? await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, processorIds))
    : [];
  const processorNames = new Map(processors.map((processor) => [processor.id, processor.firstName]));

  // Cents/minutes are an internal storage detail; the API speaks dollars and hours.
  return c.json(
    rows.map((r) => ({
      id: r.id,
      regularHours: minutesToHourString(r.regularMinutes),
      overtimeHours: minutesToHourString(r.overtimeMinutes),
      grossPay: centsToDollarString(r.grossPayCents),
      status: r.status,
      processedBy: r.finalizedById ? processorNames.get(r.finalizedById) ?? null : null,
      payPeriod: { startDate: r.startDate, endDate: r.endDate, payDate: r.payDate },
    }))
  );
});

payrollRoutes.get("/team-stubs", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const me = c.get("user");
  const rows = await db.select({
    id: payStubs.id,
    firstName: users.firstName,
    lastName: users.lastName,
    regularMinutes: payStubs.regularMinutes,
    overtimeMinutes: payStubs.overtimeMinutes,
    grossPayCents: payStubs.grossPayCents,
    status: payStubs.status,
    startDate: payPeriods.startDate,
    endDate: payPeriods.endDate,
    payDate: payPeriods.payDate,
  }).from(payStubs)
    .innerJoin(users, eq(payStubs.userId, users.id))
    .innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id))
    .where(me.role === "ADMIN" ? undefined : eq(users.supervisorId, me.id))
    .orderBy(desc(payPeriods.startDate), users.lastName);

  return c.json(rows.map((row) => ({
    id: row.id,
    employeeName: `${row.firstName} ${row.lastName}`,
    regularHours: minutesToHourString(row.regularMinutes),
    overtimeHours: minutesToHourString(row.overtimeMinutes),
    grossPay: centsToDollarString(row.grossPayCents),
    status: row.status,
    payPeriod: { startDate: row.startDate, endDate: row.endDate, payDate: row.payDate },
  })));
});
