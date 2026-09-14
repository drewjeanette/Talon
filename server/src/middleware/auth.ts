import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { verifyAccessToken, type Role } from "../lib/jwt.js";
import type { AppEnv } from "../types.js";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or malformed Authorization header." });
  }

  try {
    const payload = await verifyAccessToken(header.slice("Bearer ".length), c.env.JWT_ACCESS_SECRET);
    c.set("user", { id: payload.sub, role: payload.role, email: payload.email });
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token." });
  }

  await next();
};

/**
 * Role-based access control. ADMIN always passes: the hierarchy is
 * student < supervisor < admin rather than three disjoint roles.
 *
 * This gates the *route*. Handlers additionally scope the *data* they return
 * (see reports/timeclock), so a miss in one layer does not expose another
 * department's records.
 */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401, { message: "Not authenticated." });
    if (user.role !== "ADMIN" && !roles.includes(user.role)) {
      throw new HTTPException(403, { message: "Insufficient permissions." });
    }
    await next();
  };
}
