import type { Config } from "drizzle-kit";

// Generates SQL migrations into ./migrations, which `wrangler d1 migrations
// apply` then runs against local or remote D1. The migrations folder is the
// artifact the team shares through git - that, not the remote database, is how
// everyone stays on the same schema.
export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
