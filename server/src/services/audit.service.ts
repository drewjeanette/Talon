import type { Request } from "express";
import { prisma } from "../config/prisma.js";

export async function writeAuditLog(
  req: Request,
  action: string,
  entityType: string,
  entityId?: number,
  metadata?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      userId: req.user?.id,
      action,
      entityType,
      entityId,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      ipAddress: req.ip,
    },
  });
}
