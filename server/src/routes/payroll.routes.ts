import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { generatePayStubsForPeriod, finalizePayPeriod } from "../services/payroll.service.js";
import { writeAuditLog } from "../services/audit.service.js";

export const payrollRouter = Router();

payrollRouter.use(requireAuth);

const createPeriodSchema = z.object({
  type: z.enum(["BIWEEKLY", "MONTHLY"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  payDate: z.string().datetime(),
});

payrollRouter.get(
  "/periods",
  requireRole("SUPERVISOR", "ADMIN"),
  asyncHandler(async (_req, res) => {
    const periods = await prisma.payPeriod.findMany({ orderBy: { startDate: "desc" }, take: 50 });
    res.json(periods);
  })
);

payrollRouter.post(
  "/periods",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createPeriodSchema.parse(req.body);
    if (new Date(body.endDate) <= new Date(body.startDate)) {
      throw new HttpError(400, "endDate must be after startDate.");
    }
    const period = await prisma.payPeriod.create({
      data: {
        type: body.type,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        payDate: new Date(body.payDate),
      },
    });
    await writeAuditLog(req, "PAY_PERIOD_CREATE", "PayPeriod", period.id);
    res.status(201).json(period);
  })
);

payrollRouter.post(
  "/periods/:id/generate",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const stubs = await generatePayStubsForPeriod(id);
    await writeAuditLog(req, "PAY_STUBS_GENERATE", "PayPeriod", id, { count: stubs.length });
    res.json({ generated: stubs.length, stubs });
  })
);

payrollRouter.post(
  "/periods/:id/finalize",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const period = await finalizePayPeriod(id);
    await writeAuditLog(req, "PAY_PERIOD_FINALIZE", "PayPeriod", id);
    res.json(period);
  })
);

// Employee's own pay stub history.
payrollRouter.get(
  "/my-stubs",
  asyncHandler(async (req, res) => {
    const stubs = await prisma.payStub.findMany({
      where: { userId: req.user!.id },
      include: { payPeriod: true },
      orderBy: { payPeriod: { startDate: "desc" } },
    });
    res.json(stubs);
  })
);
