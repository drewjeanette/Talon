import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { isIpAllowed } from "../utils/cidr.js";

export const corsMiddleware = cors({
  origin: env.CORS_ORIGINS,
  credentials: true,
});

export const helmetMiddleware = helmet({
  // Cross-origin isolation defaults are fine for a same-origin-ish API;
  // adjust if the frontend and API ever need to share resources cross-origin.
  crossOriginResourcePolicy: { policy: "same-site" },
});

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limiter for auth endpoints to slow down credential stuffing / brute force.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

// Optional app-layer network allowlist (e.g. TN Tech campus subnet / VPN range).
// Disabled by default (ALLOWED_CIDRS empty) - see docs/SECURITY.md.
export function networkAllowlist(req: Request, res: Response, next: NextFunction) {
  if (env.ALLOWED_CIDR_LIST.length === 0) return next();

  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0]) ?? req.socket.remoteAddress ?? "";

  if (!isIpAllowed(clientIp, env.ALLOWED_CIDR_LIST)) {
    return res.status(403).json({ error: "Access denied from this network." });
  }
  next();
}
