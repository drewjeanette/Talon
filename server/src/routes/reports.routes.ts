import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { buildPayrollReportRows, rowsToCsv } from "../services/report.service.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole("SUPERVISOR", "ADMIN"));

const querySchema = z.object({
  scope: z.enum(["DEPARTMENT", "COLLEGE", "ALL"]).default("DEPARTMENT"),
  scopeId: z.coerce.number().int().optional(),
  payPeriodId: z.coerce.number().int(),
  format: z.enum(["csv", "json"]).default("csv"),
});

// Auto-generates a payroll report scoped to a department or college for a
// given pay period. Supervisors are hard-pinned to their own department -
// the scope/scopeId they pass is ignored to prevent viewing other units' pay data.
reportsRouter.get(
  "/payroll",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);

    let scope = query.scope;
    let scopeId = query.scopeId;

    if (req.user!.role === "SUPERVISOR") {
      const supervisor = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!supervisor?.departmentId) {
        throw new HttpError(422, "Your account has no department assigned.");
      }
      scope = "DEPARTMENT";
      scopeId = supervisor.departmentId;
    }

    const rows = await buildPayrollReportRows({ scope, scopeId, payPeriodId: query.payPeriodId });

    await prisma.reportRun.create({
      data: {
        requestedById: req.user!.id,
        scope,
        scopeId,
        payPeriodId: query.payPeriodId,
        format: query.format,
        rowCount: rows.length,
      },
    });

    if (query.format === "json") {
      return res.json(rows);
    }

    const csv = rowsToCsv(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-report-${query.payPeriodId}.csv"`);
    res.send(csv);
  })
);
