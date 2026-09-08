import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env } from "./config/env.js";
import { corsMiddleware, helmetMiddleware, apiRateLimiter, networkAllowlist } from "./middleware/security.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { orgRouter } from "./routes/org.routes.js";
import { timeclockRouter } from "./routes/timeclock.routes.js";
import { payrollRouter } from "./routes/payroll.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";

const app = express();

// Trust one hop of proxy (Cloudflare / load balancer) so req.ip and
// x-forwarded-for are read correctly in production.
app.set("trust proxy", 1);

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(networkAllowlist);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", apiRateLimiter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/org", orgRouter);
app.use("/api/timeclock", timeclockRouter);
app.use("/api/payroll", payrollRouter);
app.use("/api/reports", reportsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Talon API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
