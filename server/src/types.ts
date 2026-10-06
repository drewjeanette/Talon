import type { Role } from "./lib/jwt.js";

/** Bindings configured in wrangler.toml plus secrets set via `wrangler secret put`. */
export interface Bindings {
  DB: D1Database;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRY: string;
  JWT_REFRESH_EXPIRY: string;
  CORS_ORIGIN: string;
  ENVIRONMENT?: string;
  /** Public site URL for links in emails, e.g. https://talontime.org */
  APP_URL?: string;
  /** Secret. When set, email is sent through Resend. */
  RESEND_API_KEY?: string;
  /** Sender address on a Resend-verified domain, e.g. "Talon <no-reply@talontime.org>" */
  EMAIL_FROM?: string;
  /** "true" prints emails to the console instead of sending (local dev only). */
  EMAIL_DEV_LOG?: string;
}

/** Values attached to the request context by middleware. */
export interface Variables {
  user: { id: number; role: Role; email: string };
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
