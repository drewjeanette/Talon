import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { passwordResetTokens, refreshTokens, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  sha256Hex,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import {
  appUrl,
  passwordChangedEmail,
  passwordResetEmail,
  sendEmailInBackground,
} from "../services/email.service.js";
import type { AppEnv } from "../types.js";

export const authRoutes = new Hono<AppEnv>();

const REFRESH_COOKIE = "talon_refresh";
const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const TNTECH_EMAIL_SUFFIX = "@tntech.edu";

const tntechEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine((email) => email.endsWith(TNTECH_EMAIL_SUFFIX), {
    message: "Use a Tennessee Tech email ending in @tntech.edu.",
  });

const loginSchema = z.object({
  email: tntechEmail,
  password: z.string().min(1).max(128),
});

const newPassword = z
  .string()
  .min(12, "New password must be at least 12 characters.")
  .max(128, "New password must be no more than 128 characters.");

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword,
});

const forgotPasswordSchema = z.object({ email: tntechEmail });

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword,
});

const RESET_TOKEN_MINUTES = 30;
// Requests beyond these limits are silently ignored (the response never changes).
const RESET_LIMIT_PER_USER_PER_HOUR = 3;
const RESET_LIMIT_PER_IP_PER_HOUR = 10;

interface UserWithDepartment {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  role: "STUDENT" | "SUPERVISOR" | "ADMIN";
  payType: "BIWEEKLY" | "MONTHLY";
  mustResetPw: boolean;
  department: { id: number; name: string; college: { id: number; name: string } | null } | null;
}

/**
 * The single definition of "the current user" as the client sees it. Both
 * /login and /me return exactly this, so the object the client caches at login
 * never differs from the one it refetches later.
 */
function serializeUser(user: UserWithDepartment) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    preferredName: user.preferredName,
    role: user.role,
    payType: user.payType,
    mustResetPw: user.mustResetPw,
    department: user.department
      ? {
          id: user.department.id,
          name: user.department.name,
          college: user.department.college
            ? { id: user.department.college.id, name: user.department.college.name }
            : null,
        }
      : null,
  };
}

async function issueTokens(
  c: Context<AppEnv>,
  userId: number,
  role: "STUDENT" | "SUPERVISOR" | "ADMIN",
  email: string
) {
  const db = getDb(c.env.DB);
  const accessToken = await signAccessToken(
    { sub: userId, role, email },
    c.env.JWT_ACCESS_SECRET,
    c.env.JWT_ACCESS_EXPIRY || "15m"
  );
  const refreshToken = await signRefreshToken(
    userId,
    c.env.JWT_REFRESH_SECRET,
    c.env.JWT_REFRESH_EXPIRY || "7d"
  );

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: await sha256Hex(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_SECONDS * 1000),
  });

  setCookie(c, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== "development",
    sameSite: "Strict",
    maxAge: REFRESH_MAX_AGE_SECONDS,
    path: "/api/auth",
  });

  return accessToken;
}

authRoutes.post("/login", async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    with: { department: { with: { college: true } } },
  });

  // Same response whether the account is missing, inactive, or the password is
  // wrong, so the endpoint cannot be used to enumerate valid addresses.
  const invalid = () => new HTTPException(401, { message: "Invalid email or password." });
  if (!user || !user.isActive) throw invalid();
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid();

  const accessToken = await issueTokens(c, user.id, user.role, user.email);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await writeAuditLog(c, "LOGIN", "User", user.id);

  // Must match the shape returned by GET /auth/me: the client stores this
  // object as the current user, and the dashboard keys off payType to decide
  // whether to show the web clock. Omitting fields here silently hides
  // features until the next refresh.
  return c.json({ accessToken, user: serializeUser(user) });
});

authRoutes.post("/refresh", async (c) => {
  const token = getCookie(c, REFRESH_COOKIE);
  if (!token) return c.body(null, 204);

  let userId: number;
  try {
    userId = await verifyRefreshToken(token, c.env.JWT_REFRESH_SECRET);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired refresh token." });
  }

  const db = getDb(c.env.DB);
  const tokenHash = await sha256Hex(token);
  const stored = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.userId, userId),
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt)
    ),
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw new HTTPException(401, { message: "Refresh token no longer valid." });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.isActive) throw new HTTPException(401, { message: "Account not available." });

  // Rotate: the presented token is spent, a new pair is issued.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, stored.id));

  const accessToken = await issueTokens(c, user.id, user.role, user.email);
  return c.json({ accessToken });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, REFRESH_COOKIE);
  if (token) {
    const db = getDb(c.env.DB);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, await sha256Hex(token)), isNull(refreshTokens.revokedAt)));
  }
  deleteCookie(c, REFRESH_COOKIE, { path: "/api/auth" });
  return c.body(null, 204);
});

authRoutes.get("/me", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const user = await db.query.users.findFirst({
    where: eq(users.id, c.get("user").id),
    with: { department: { with: { college: true } } },
  });
  if (!user) throw new HTTPException(404, { message: "User not found." });

  return c.json(serializeUser(user));
});

authRoutes.post("/change-password", requireAuth, async (c) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const me = c.get("user");

  const user = await db.query.users.findFirst({ where: eq(users.id, me.id) });
  if (!user) throw new HTTPException(404, { message: "User not found." });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HTTPException(401, { message: "Current password is incorrect." });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.batch([
    db.update(users).set({ passwordHash, mustResetPw: false }).where(eq(users.id, user.id)),
    // Every other session is invalidated, so a stolen session dies when the
    // real owner changes their password.
    db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt))),
  ]);

  await writeAuditLog(c, "PASSWORD_CHANGE", "User", user.id);
  sendEmailInBackground(c, passwordChangedEmail(user.email, user.firstName));
  return c.body(null, 204);
});

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

authRoutes.post("/forgot-password", async (c) => {
  const { email } = forgotPasswordSchema.parse(await c.req.json());
  // Identical response whether or not the account exists, so this endpoint
  // cannot be used to discover valid addresses.
  const response = c.json({
    message: "If that email belongs to a Talon account, a link to reset the password is on its way.",
  });

  const db = getDb(c.env.DB);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.isActive) return response;

  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [[byUser], [byIp]] = await Promise.all([
    db.select({ n: count() }).from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, hourAgo))),
    ip
      ? db.select({ n: count() }).from(passwordResetTokens)
          .where(and(eq(passwordResetTokens.requestedIp, ip), gt(passwordResetTokens.createdAt, hourAgo)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  if (byUser.n >= RESET_LIMIT_PER_USER_PER_HOUR || byIp.n >= RESET_LIMIT_PER_IP_PER_HOUR) return response;

  const token = randomToken();
  const now = new Date();
  await db.batch([
    // Only the newest link works.
    db.update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt))),
    db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(now.getTime() + RESET_TOKEN_MINUTES * 60 * 1000),
      requestedIp: ip,
    }),
  ]);

  await writeAuditLog(c, "PASSWORD_RESET_REQUEST", "User", user.id);
  const link = `${appUrl(c)}/reset-password?token=${encodeURIComponent(token)}`;
  sendEmailInBackground(c, passwordResetEmail(user.email, user.firstName, link, RESET_TOKEN_MINUTES));
  return response;
});

authRoutes.post("/reset-password", async (c) => {
  const { token, newPassword } = resetPasswordSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);

  const stored = await db.query.passwordResetTokens.findFirst({
    where: and(eq(passwordResetTokens.tokenHash, await sha256Hex(token)), isNull(passwordResetTokens.usedAt)),
  });
  const user = stored && stored.expiresAt > new Date()
    ? await db.query.users.findFirst({ where: eq(users.id, stored.userId) })
    : undefined;
  if (!stored || !user || !user.isActive) {
    throw new HTTPException(400, { message: "This reset link is invalid or has expired. Request a new one." });
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await db.batch([
    db.update(users).set({ passwordHash, mustResetPw: false }).where(eq(users.id, user.id)),
    db.update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt))),
    db.update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt))),
  ]);

  await writeAuditLog(c, "PASSWORD_RESET", "User", user.id);
  sendEmailInBackground(c, passwordChangedEmail(user.email, user.firstName));
  return c.body(null, 204);
});
