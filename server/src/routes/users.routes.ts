import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Supervisors see their direct reports; admins see everyone (optionally filtered).
usersRouter.get(
  "/",
  requireRole("SUPERVISOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

    const where =
      req.user!.role === "ADMIN"
        ? { departmentId }
        : { supervisorId: req.user!.id };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        payType: true,
        isActive: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    res.json(users);
  })
);

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["STUDENT", "SUPERVISOR", "ADMIN"]),
  payType: z.enum(["BIWEEKLY", "MONTHLY"]),
  departmentId: z.number().int().optional(),
  supervisorId: z.number().int().optional(),
  hourlyRate: z.number().positive().optional(),
  annualSalary: z.number().positive().optional(),
});

// Admin-only: provision new employees. A one-time random password is issued
// and must be rotated on first login (mustResetPw), never emailed in plaintext
// here - in production this should go through TN Tech SSO/OneStop provisioning
// instead of local passwords (see docs/SECURITY.md).
usersRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const tempPassword = crypto.randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, env.BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { ...data, passwordHash, mustResetPw: true },
    });

    await writeAuditLog(req, "USER_CREATE", "User", user.id);
    res.status(201).json({ id: user.id, email: user.email, tempPassword });
  })
);

usersRouter.patch(
  "/:id/deactivate",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(req, "USER_DEACTIVATE", "User", id);
    res.status(204).send();
  })
);
