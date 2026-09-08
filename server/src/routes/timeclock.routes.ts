import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { writeAuditLog } from "../services/audit.service.js";

export const timeclockRouter = Router();

timeclockRouter.use(requireAuth);

timeclockRouter.post(
  "/clock-in",
  asyncHandler(async (req, res) => {
    const openEntry = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.id, clockOut: null },
    });
    if (openEntry) throw new HttpError(409, "Already clocked in.");

    const entry = await prisma.timeEntry.create({
      data: { userId: req.user!.id, clockIn: new Date(), source: "WEB" },
    });
    await writeAuditLog(req, "CLOCK_IN", "TimeEntry", entry.id);
    res.status(201).json(entry);
  })
);

timeclockRouter.post(
  "/clock-out",
  asyncHandler(async (req, res) => {
    const openEntry = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.id, clockOut: null },
    });
    if (!openEntry) throw new HttpError(409, "Not currently clocked in.");

    const entry = await prisma.timeEntry.update({
      where: { id: openEntry.id },
      data: { clockOut: new Date() },
    });
    await writeAuditLog(req, "CLOCK_OUT", "TimeEntry", entry.id);
    res.json(entry);
  })
);

timeclockRouter.get(
  "/my-entries",
  asyncHandler(async (req, res) => {
    const entries = await prisma.timeEntry.findMany({
      where: { userId: req.user!.id },
      orderBy: { clockIn: "desc" },
      take: 100,
    });
    res.json(entries);
  })
);

// Entries awaiting a supervisor/admin's approval for their reports.
timeclockRouter.get(
  "/pending",
  requireRole("SUPERVISOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === "ADMIN"
        ? { status: "PENDING" as const }
        : { status: "PENDING" as const, user: { supervisorId: req.user!.id } };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { clockIn: "asc" },
    });
    res.json(entries);
  })
);

const decisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

timeclockRouter.patch(
  "/:id/decision",
  requireRole("SUPERVISOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = decisionSchema.parse(req.body);

    const entry = await prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new HttpError(404, "Time entry not found.");

    if (req.user!.role === "SUPERVISOR") {
      const owner = await prisma.user.findUnique({ where: { id: entry.userId } });
      if (owner?.supervisorId !== req.user!.id) {
        throw new HttpError(403, "You do not supervise this employee.");
      }
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: { status, editedById: req.user!.id },
    });
    await writeAuditLog(req, `TIME_ENTRY_${status}`, "TimeEntry", id);
    res.json(updated);
  })
);

const correctionSchema = z.object({
  clockIn: z.string().datetime(),
  clockOut: z.string().datetime().nullable(),
  notes: z.string().max(500).optional(),
});

timeclockRouter.patch(
  "/:id/correct",
  requireRole("SUPERVISOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = correctionSchema.parse(req.body);

    if (body.clockOut && new Date(body.clockOut) <= new Date(body.clockIn)) {
      throw new HttpError(400, "clockOut must be after clockIn.");
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        clockIn: new Date(body.clockIn),
        clockOut: body.clockOut ? new Date(body.clockOut) : null,
        notes: body.notes,
        status: "PENDING",
        editedById: req.user!.id,
      },
    });
    await writeAuditLog(req, "TIME_ENTRY_CORRECT", "TimeEntry", id);
    res.json(updated);
  })
);
