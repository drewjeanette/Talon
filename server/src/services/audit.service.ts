import type { Context } from "hono";
import { getDb } from "../db/index.js";
import { auditLogs } from "../db/schema.js";
import type { AppEnv } from "../types.js";

/**
 * Records a significant action. Cloudflare provides the true client IP in
 * CF-Connecting-IP, which cannot be spoofed by the client the way a
 * self-reported X-Forwarded-For header can.
 */
export async function writeAuditLog(
  c: Context<AppEnv>,
  action: string,
  entityType: string,
  entityId?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getDb(c.env.DB);
  const user = c.get("user");

  await db.insert(auditLogs).values({
    userId: user?.id ?? null,
    action,
    entityType,
    entityId: entityId ?? null,
    metadata: metadata ?? null,
    ipAddress: c.req.header("CF-Connecting-IP") ?? null,
  });
}
