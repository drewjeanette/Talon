import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { payPeriods, payStubs } from "../db/schema.js";
import { centsToDollarString, minutesToHourString } from "../lib/money.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { finalizePayPeriod, generatePayStubsForPeriod } from "../services/payroll.service.js";
import { writeAuditLog } from "../services/audit.service.js";
import type { AppEnv } from "../types.js";

export const payrollRoutes = new Hono<AppEnv>();

payrollRoutes.use("*", requireAuth);

payrollRoutes.get("/periods", requireRole("SUPERVISOR"), async (c) => {
  const db = getDb(c.env.DB);
  const periods = await db
    .select()
    .from(payPeriods)
    .orderBy(desc(payPeriods.startDate))
    .limit(50);
  return c.json(periods);
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
  const period = await finalizePayPeriod(db, id);
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
      startDate: payPeriods.startDate,
      endDate: payPeriods.endDate,
      payDate: payPeriods.payDate,
    })
    .from(payStubs)
    .innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id))
    .where(eq(payStubs.userId, c.get("user").id))
    .orderBy(desc(payPeriods.startDate));

  // Cents/minutes are an internal storage detail; the API speaks dollars and hours.
  return c.json(
    rows.map((r) => ({
      id: r.id,
      regularHours: minutesToHourString(r.regularMinutes),
      overtimeHours: minutesToHourString(r.overtimeMinutes),
      grossPay: centsToDollarString(r.grossPayCents),
      status: r.status,
      payPeriod: { startDate: r.startDate, endDate: r.endDate, payDate: r.payDate },
    }))
  );
});
