import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";

export const orgRouter = Router();

orgRouter.use(requireAuth);

orgRouter.get(
  "/colleges",
  asyncHandler(async (_req, res) => {
    const colleges = await prisma.college.findMany({
      include: { departments: { select: { id: true, name: true, code: true, isActive: true } } },
      orderBy: { name: "asc" },
    });
    res.json(colleges);
  })
);

const collegeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
});

// Admin-only: colleges are few and change rarely, but the department list
// below needs somewhere to point new/reassigned departments at.
orgRouter.post(
  "/colleges",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const data = collegeSchema.parse(req.body);
    const college = await prisma.college.create({ data });
    await writeAuditLog(req, "COLLEGE_CREATE", "College", college.id);
    res.status(201).json(college);
  })
);

orgRouter.get(
  "/departments",
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      include: { college: { select: { id: true, name: true } } },
      orderBy: { code: "asc" },
    });
    res.json(departments);
  })
);

const createDepartmentSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1),
  collegeId: z.number().int().nullable().optional(),
});

// Admin-only: this is the editable home for department codes - no more
// hardcoding a list in source. New departments start unassigned to a college
// (see schema.prisma) until an admin picks one.
orgRouter.post(
  "/departments",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const data = createDepartmentSchema.parse(req.body);
    const department = await prisma.department.create({ data });
    await writeAuditLog(req, "DEPARTMENT_CREATE", "Department", department.id);
    res.status(201).json(department);
  })
);

const updateDepartmentSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).optional(),
  collegeId: z.number().int().nullable().optional(),
  isActive: z.boolean().optional(),
});

orgRouter.patch(
  "/departments/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = updateDepartmentSchema.parse(req.body);
    const department = await prisma.department.update({ where: { id }, data });
    await writeAuditLog(req, "DEPARTMENT_UPDATE", "Department", id, data);
    res.json(department);
  })
);
