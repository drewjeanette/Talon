import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";

/**
 * Builds a Drizzle client bound to the request's D1 binding.
 *
 * Workers have no long-lived process, so there is no connection pool to reuse:
 * the client is created per request from the binding Cloudflare hands us.
 */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
