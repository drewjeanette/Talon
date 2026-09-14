import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// Talon schema for Cloudflare D1 (SQLite).
//
// Two conventions that differ from a MySQL schema and matter for payroll:
//   * Money is stored as INTEGER cents, never a float. SQLite has no true
//     DECIMAL type, so storing dollars as REAL would introduce rounding drift
//     into wages. Convert at the edges with lib/money.ts.
//   * Worked time is stored as INTEGER minutes for the same reason.

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const colleges = sqliteTable("colleges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  ...timestamps,
});

export const departments = sqliteTable(
  "departments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    // Nullable: codes are seeded from the registrar list before anyone has
    // assigned each one to a college. Admins fill this in from the UI.
    collegeId: integer("college_id").references(() => colleges.id),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("departments_college_idx").on(t.collegeId)]
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    role: text("role", { enum: ["STUDENT", "SUPERVISOR", "ADMIN"] })
      .notNull()
      .default("STUDENT"),
    payType: text("pay_type", { enum: ["BIWEEKLY", "MONTHLY"] })
      .notNull()
      .default("BIWEEKLY"),

    // Student workers are hourly; faculty/staff are salaried. Both in cents.
    hourlyRateCents: integer("hourly_rate_cents"),
    annualSalaryCents: integer("annual_salary_cents"),

    departmentId: integer("department_id").references(() => departments.id),
    supervisorId: integer("supervisor_id"),

    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    mustResetPw: integer("must_reset_pw", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (t) => [
    index("users_department_idx").on(t.departmentId),
    index("users_supervisor_idx").on(t.supervisorId),
  ]
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("refresh_tokens_user_idx").on(t.userId),
    index("refresh_tokens_hash_idx").on(t.tokenHash),
  ]
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    clockIn: integer("clock_in", { mode: "timestamp" }).notNull(),
    clockOut: integer("clock_out", { mode: "timestamp" }),
    source: text("source", { enum: ["WEB", "KIOSK", "MANUAL"] })
      .notNull()
      .default("WEB"),
    notes: text("notes"),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    editedById: integer("edited_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("time_entries_user_clockin_idx").on(t.userId, t.clockIn),
    index("time_entries_status_idx").on(t.status),
  ]
);

export const payPeriods = sqliteTable(
  "pay_periods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["BIWEEKLY", "MONTHLY"] }).notNull(),
    startDate: integer("start_date", { mode: "timestamp" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp" }).notNull(),
    payDate: integer("pay_date", { mode: "timestamp" }).notNull(),
    status: text("status", { enum: ["OPEN", "PROCESSING", "CLOSED"] })
      .notNull()
      .default("OPEN"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pay_periods_range_idx").on(t.type, t.startDate, t.endDate),
    index("pay_periods_status_idx").on(t.status),
  ]
);

export const payStubs = sqliteTable(
  "pay_stubs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    payPeriodId: integer("pay_period_id")
      .notNull()
      .references(() => payPeriods.id),
    regularMinutes: integer("regular_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    grossPayCents: integer("gross_pay_cents").notNull().default(0),
    status: text("status", { enum: ["DRAFT", "FINALIZED", "PAID"] })
      .notNull()
      .default("DRAFT"),
    generatedAt: integer("generated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("pay_stubs_user_period_idx").on(t.userId, t.payPeriodId),
    index("pay_stubs_period_idx").on(t.payPeriodId),
  ]
);

export const reportRuns = sqliteTable(
  "report_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestedById: integer("requested_by_id")
      .notNull()
      .references(() => users.id),
    scope: text("scope", { enum: ["DEPARTMENT", "COLLEGE", "ALL"] }).notNull(),
    scopeId: integer("scope_id"),
    payPeriodId: integer("pay_period_id"),
    format: text("format").notNull().default("csv"),
    rowCount: integer("row_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("report_runs_requested_by_idx").on(t.requestedById)]
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    metadata: text("metadata", { mode: "json" }),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ]
);

// ---------- Relations (for Drizzle's query API) ----------

export const collegesRelations = relations(colleges, ({ many }) => ({
  departments: many(departments),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  college: one(colleges, { fields: [departments.collegeId], references: [colleges.id] }),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  supervisor: one(users, {
    fields: [users.supervisorId],
    references: [users.id],
    relationName: "supervisor",
  }),
  reports: many(users, { relationName: "supervisor" }),
  timeEntries: many(timeEntries),
  payStubs: many(payStubs),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
}));

export const payPeriodsRelations = relations(payPeriods, ({ many }) => ({
  payStubs: many(payStubs),
}));

export const payStubsRelations = relations(payStubs, ({ one }) => ({
  user: one(users, { fields: [payStubs.userId], references: [users.id] }),
  payPeriod: one(payPeriods, { fields: [payStubs.payPeriodId], references: [payPeriods.id] }),
}));

export type User = typeof users.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type PayPeriod = typeof payPeriods.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
