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
}

/** Values attached to the request context by middleware. */
export interface Variables {
  user: { id: number; role: Role; email: string };
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
