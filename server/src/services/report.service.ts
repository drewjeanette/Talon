import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { colleges, departments, payPeriods, payStubs, users } from "../db/schema.js";
import { centsToDollarString, minutesToHourString } from "../lib/money.js";

export type ReportScope = "DEPARTMENT" | "COLLEGE" | "ALL";

interface ReportFilter {
  scope: ReportScope;
  scopeId?: number;
  payPeriodId: number;
}

/**
 * Builds payroll report rows in a single joined query rather than fetching
 * stubs and then looking up each user (which would blow the D1 subrequest
 * budget on any realistic headcount).
 */
export async function buildPayrollReportRows(db: Db, filter: ReportFilter) {
  const conditions = [eq(payStubs.payPeriodId, filter.payPeriodId)];
  if (filter.scope === "DEPARTMENT" && filter.scopeId !== undefined) {
    conditions.push(eq(users.departmentId, filter.scopeId));
  }
  if (filter.scope === "COLLEGE" && filter.scopeId !== undefined) {
    conditions.push(eq(departments.collegeId, filter.scopeId));
  }

  const rows = await db
    .select({
      employeeId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      payType: users.payType,
      department: departments.name,
      college: colleges.name,
      periodStart: payPeriods.startDate,
      periodEnd: payPeriods.endDate,
      regularMinutes: payStubs.regularMinutes,
      overtimeMinutes: payStubs.overtimeMinutes,
      grossPayCents: payStubs.grossPayCents,
      status: payStubs.status,
      reviewStatus: payStubs.reviewStatus,
      reviewedById: payStubs.reviewedById,
      reviewReason: payStubs.reviewReason,
    })
    .from(payStubs)
    .innerJoin(users, eq(payStubs.userId, users.id))
    .innerJoin(payPeriods, eq(payStubs.payPeriodId, payPeriods.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(colleges, eq(departments.collegeId, colleges.id))
    .where(and(...conditions))
    .orderBy(users.lastName);

  const reviewerIds = [...new Set(rows.map((row) => row.reviewedById).filter((id): id is number => id !== null))];
  const reviewers = reviewerIds.length
    ? await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, reviewerIds))
    : [];
  const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.firstName]));

  return rows.map((row) => ({
    employeeId: row.employeeId,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    payType: row.payType,
    department: row.department ?? "",
    college: row.college ?? "",
    payPeriodStart: row.periodStart.toISOString().slice(0, 10),
    payPeriodEnd: row.periodEnd.toISOString().slice(0, 10),
    regularHours: minutesToHourString(row.regularMinutes),
    overtimeHours: minutesToHourString(row.overtimeMinutes),
    grossPay: centsToDollarString(row.grossPayCents),
    status: row.status,
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedById ? reviewerNames.get(row.reviewedById) ?? "" : "",
    reviewReason: row.reviewReason ?? "",
  }));
}

/** Minimal RFC 4180 CSV writer - quotes fields containing commas/quotes/newlines. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);

  const escape = (value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\r\n");
}
