import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { reportRuns } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { buildPayrollReportRows, rowsToCsv, type ReportScope } from "../services/report.service.js";
import { supervisedStudentIds } from "../services/access.service.js";
import type { AppEnv } from "../types.js";

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.use("*", requireAuth, requireRole("SUPERVISOR"));

const ids = z.array(z.coerce.number().int().positive()).max(500);

const querySchema = z.object({
  scope: z.enum(["DEPARTMENT", "COLLEGE", "ALL"]).default("ALL"),
  scopeId: z.coerce.number().int().optional(),
  payPeriodId: z.coerce.number().int(),
  departmentId: ids.default([]),
  chargeAccountId: ids.default([]),
  employeeId: ids.default([]),
  format: z.enum(["csv", "json"]).default("csv"),
});

/**
 * Payroll report for a pay period: hours and pay per person per charge
 * account, filterable by home department, charge account, and people
 * (repeat a parameter to pass several).
 *
 * Supervisors only ever get the students assigned to them: any people filter
 * they send is intersected with that list on the server.
 */
reportRoutes.get("/payroll", async (c) => {
  const query = querySchema.parse({
    scope: c.req.query("scope"),
    scopeId: c.req.query("scopeId"),
    payPeriodId: c.req.query("payPeriodId"),
    departmentId: c.req.queries("departmentId") ?? [],
    chargeAccountId: c.req.queries("chargeAccountId") ?? [],
    employeeId: c.req.queries("employeeId") ?? [],
    format: c.req.query("format"),
  });

  const db = getDb(c.env.DB);
  const me = c.get("user");

  let scope: ReportScope = query.scope;
  let employeeIds: number[] | undefined = query.employeeId.length ? query.employeeId : undefined;
  if (me.role === "SUPERVISOR") {
    scope = "ALL";
    const mine = (await supervisedStudentIds(db, me.id)).map((row) => row.id);
    employeeIds = employeeIds ? employeeIds.filter((id) => mine.includes(id)) : mine;
  }

  const rows = await buildPayrollReportRows(db, {
    payPeriodId: query.payPeriodId,
    scope,
    scopeId: query.scopeId,
    departmentIds: query.departmentId,
    chargeAccountIds: query.chargeAccountId,
    employeeIds,
  });

  await db.insert(reportRuns).values({
    requestedById: me.id,
    scope,
    scopeId: query.scopeId ?? null,
    payPeriodId: query.payPeriodId,
    format: query.format,
    rowCount: rows.length,
  });

  if (query.format === "json") return c.json(rows);

  return new Response(rowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-report-${query.payPeriodId}.csv"`,
    },
  });
});
