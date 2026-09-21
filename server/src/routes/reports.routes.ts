import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { reportRuns, users } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { buildPayrollReportRows, rowsToCsv, type ReportScope } from "../services/report.service.js";
import type { AppEnv } from "../types.js";

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.use("*", requireAuth, requireRole("SUPERVISOR"));

const querySchema = z.object({
  scope: z.enum(["DEPARTMENT", "COLLEGE", "ALL"]).default("DEPARTMENT"),
  scopeId: z.coerce.number().int().optional(),
  payPeriodId: z.coerce.number().int(),
  format: z.enum(["csv", "json"]).default("csv"),
});

/**
 * Auto-generates a payroll report for a pay period.
 *
 * Supervisors are pinned to their own department: whatever scope they pass is
 * overwritten with their department id from the database, so the parameter
 * cannot be tampered with to read another unit's pay data.
 */
reportRoutes.get("/payroll", async (c) => {
  const query = querySchema.parse({
    scope: c.req.query("scope"),
    scopeId: c.req.query("scopeId"),
    payPeriodId: c.req.query("payPeriodId"),
    format: c.req.query("format"),
  });

  const db = getDb(c.env.DB);
  const me = c.get("user");

  let scope: ReportScope = query.scope;
  let scopeId = query.scopeId;

  if (me.role === "SUPERVISOR") {
    const supervisor = await db.query.users.findFirst({ where: eq(users.id, me.id) });
    if (!supervisor?.departmentId) {
      throw new HTTPException(422, { message: "Your account has no department assigned." });
    }
    scope = "DEPARTMENT";
    scopeId = supervisor.departmentId;
  }

  const rows = await buildPayrollReportRows(db, { scope, scopeId, payPeriodId: query.payPeriodId });

  if (rows.length === 0) {
    throw new HTTPException(422, {
      message: "No payroll data is available for that pay period. Choose a period marked report-ready or ask an administrator to generate payroll first.",
    });
  }

  await db.insert(reportRuns).values({
    requestedById: me.id,
    scope,
    scopeId: scopeId ?? null,
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
