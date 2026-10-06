import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth.routes.js";
import { profilePhotoRoutes } from "./routes/profile-photo.routes.js";
import { userRoutes } from "./routes/users.routes.js";
import { orgRoutes } from "./routes/org.routes.js";
import { timeclockRoutes } from "./routes/timeclock.routes.js";
import { payrollRoutes } from "./routes/payroll.routes.js";
import { reportRoutes } from "./routes/reports.routes.js";
import { notificationRoutes } from "./routes/notifications.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

app.use("*", secureHeaders());

// Explicit origin allowlist, never "*", because the API is called with credentials.
app.use("/api/*", async (c, next) => {
  const allowed = (c.env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0] ?? ""),
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })(c, next);
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api/auth", authRoutes);
app.route("/api/auth", profilePhotoRoutes);
app.route("/api/users", userRoutes);
app.route("/api/org", orgRoutes);
app.route("/api/timeclock", timeclockRoutes);
app.route("/api/payroll", payrollRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/settings", settingsRoutes);

app.notFound((c) => c.json({ error: "Not found." }, 404));

/**
 * Central error handling. Response bodies never contain stack traces or raw
 * driver errors in any environment; full detail goes to the Worker log
 * (`wrangler tail`) where a developer can read it without exposing it to callers.
 */
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: "Validation failed.", details: err.issues }, 400);
  }

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // D1 surfaces unique-constraint violations as SQLITE_CONSTRAINT errors.
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("UNIQUE constraint failed")) {
    return c.json({ error: "A record with that value already exists." }, 409);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error." }, 500);
});

export default app;
