import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/security.js";
import { HttpError } from "../middleware/errorHandler.js";
import { writeAuditLog } from "../services/audit.service.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const REFRESH_COOKIE = "talon_refresh";
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

async function issueTokens(userId: number, role: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, role: role as never, email });
  const refreshToken = signRefreshToken(userId);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_MS),
    },
  });

  return { accessToken, refreshToken };
}

authRouter.post(
  "/login",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    // Constant response shape whether the account exists or not, to avoid
    // leaking which emails are registered.
    const user = await prisma.user.findUnique({ where: { email } });
    const invalidCreds = () => {
      throw new HttpError(401, "Invalid email or password.");
    };

    if (!user || !user.isActive) return invalidCreds();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return invalidCreds();

    const { accessToken, refreshToken } = await issueTokens(user.id, user.role, user.email);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAuditLog(req, "LOGIN", "User", user.id);

    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: REFRESH_MS,
      path: "/api/auth",
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustResetPw: user.mustResetPw,
      },
    });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new HttpError(401, "Missing refresh token.");

    let payload: { sub: number };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new HttpError(401, "Invalid or expired refresh token.");
    }

    const tokenHash = hashToken(token);
    const stored = await prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Refresh token no longer valid.");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new HttpError(401, "Account not available.");

    // Rotate: revoke the old refresh token, issue a fresh pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const { accessToken, refreshToken } = await issueTokens(user.id, user.role, user.email);

    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: REFRESH_MS,
      path: "/api/auth",
    });

    res.json({ accessToken });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      const tokenHash = hashToken(token);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        payType: true,
        mustResetPw: true,
        department: { select: { id: true, name: true, college: { select: { id: true, name: true } } } },
      },
    });
    if (!user) throw new HttpError(404, "User not found.");
    res.json(user);
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, "New password must be at least 12 characters."),
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new HttpError(401, "Current password is incorrect.");

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustResetPw: false },
    });

    // Revoke all outstanding refresh tokens so other sessions re-authenticate.
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(req, "PASSWORD_CHANGE", "User", user.id);

    res.status(204).send();
  })
);
