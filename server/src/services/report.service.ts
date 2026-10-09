import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { chargeAccounts, colleges, departments, payPeriods, payStubs, timeEntries, users } from "../db/schema.js";
import { centsToDollarString, minutesToHourString } from "../lib/money.js";
import { allocate, splitByAccount, type WorkedEntry } from "../lib/payroll-math.js";
import { fullName } from "./access.service.js";

export type ReportScope = "DEPARTMENT" | "COLLEGE" | "ALL";

export interface ReportFilter {
  payPeriodId: number;
  scope?: ReportScope;
  scopeId?: number;
  /** Home departments to include (any of). */
  departmentIds?: number[];
  /** Charge accounts to include (any of). Applied per line, after splitting. */
  chargeAccountIds?: number[];
  /** People to include (any of). Also how supervisors are limited to their students. */
  employeeIds?: number[];
}

/**
 * Builds payroll report lines: one per person per charge account they were
 * charged to in the period. A stub's minutes and cents are divided across its
 * accounts so the lines always add back up to the stub exactly.
 *
 * Runs a fixed number of queries (stubs, entries, accounts) regardless of
 * headcount, to stay inside the D1 subrequest budget.
 */
export async function buildPayrollReportRows(db: Db, filter: ReportFilter) {
  const conditions: SQL[] = [eq(payStubs.payPeriodId, filter.payPeriodId)];
  if (filter.scope === "DEPARTMENT" && filter.scopeId !== undefined) conditions.push(eq(users.departmentId, filter.scopeId));
  if (filter.scope === "COLLEGE" && filter.scopeId !== undefined) conditions.push(eq(departments.collegeId, filter.scopeId));
  if (filter.departmentIds?.length) conditions.push(inArray(users.departmentId, filter.departmentIds));
  if (filter.employeeIds) {
    if (filter.employeeIds.length === 0) return [];
    conditions.push(inArray(users.id, filter.employeeIds));
  }

  const stubs = await db
    .select({
      employeeId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      preferredName: users.preferredName,
      role: users.role,
      payType: users.payType,
      defaultChargeAccountId: users.chargeAccountId,
      departmentName: departments.name,
      departmentCode: departments.code,
      college: colleges.name,
      periodStart: payPeriods.startDate,
      periodEnd: payPeriods.endDate,
      regularMinutes: payStubs.regularMinutes,
      overtimeMinutes: payStubs.overtimeMinutes,
      hourlyRateCents: payStubs.hourlyRateCents,
      regularPayCents: payStubs.regularPayCents,
      overtimePayCents: payStubs.overtimePayCents,
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
    .orderBy(users.lastName, users.firstName);
  if (stubs.length === 0) return [];

  const period = { start: stubs[0].periodStart, end: stubs[0].periodEnd };
  const [entries, accounts, reviewers] = await Promise.all([
    db.select({ userId: timeEntries.userId, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, chargeAccountId: timeEntries.chargeAccountId })
      .from(timeEntries)
      .where(and(
        inArray(timeEntries.userId, stubs.map((stub) => stub.employeeId)),
        eq(timeEntries.status, "APPROVED"),
        gte(timeEntries.clockIn, period.start),
        lte(timeEntries.clockIn, period.end)
      )),
    db.select({ id: chargeAccounts.id, code: chargeAccounts.code, name: chargeAccounts.name, departmentCode: departments.code })
      .from(chargeAccounts)
      .leftJoin(departments, eq(chargeAccounts.departmentId, departments.id)),
    db.select({ id: users.id, firstName: users.firstName }).from(users)
      .where(inArray(users.id, [...new Set(stubs.map((stub) => stub.reviewedById).filter((id): id is number => id !== null))])),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.firstName]));
  const entriesByUser = new Map<number, WorkedEntry[]>();
  for (const { userId, ...entry } of entries) {
    const list = entriesByUser.get(userId) ?? [];
    list.push(entry);
    entriesByUser.set(userId, list);
  }

  const lines = stubs.flatMap((stub) => {
    // Shifts with no account are charged to the person's job account.
    const split = splitByAccount((entriesByUser.get(stub.employeeId) ?? []).map((entry) => ({
      ...entry,
      chargeAccountId: entry.chargeAccountId ?? stub.defaultChargeAccountId,
    })));
    if (split.length === 0) split.push({ chargeAccountId: stub.defaultChargeAccountId, regularMinutes: 0, overtimeMinutes: 0 });
    const regularWeights = split.map((row) => row.regularMinutes);
    const overtimeWeights = split.map((row) => row.overtimeMinutes);
    const regularMinutes = allocate(stub.regularMinutes, regularWeights);
    const overtimeMinutes = allocate(stub.overtimeMinutes, overtimeWeights);
    const regularPay = allocate(stub.regularPayCents, regularWeights);
    const overtimePay = allocate(stub.overtimePayCents, overtimeWeights);

    return split.map((row, index) => {
      const account = row.chargeAccountId === null ? undefined : accountById.get(row.chargeAccountId);
      const totalMinutes = regularMinutes[index] + overtimeMinutes[index];
      const totalCents = regularPay[index] + overtimePay[index];
      return {
        chargeAccountId: row.chargeAccountId,
        line: {
          employeeId: stub.employeeId,
          name: fullName(stub),
          firstName: stub.firstName,
          lastName: stub.lastName,
          preferredName: stub.preferredName ?? "",
          role: stub.role,
          payType: stub.payType,
          department: stub.departmentName ?? "",
          departmentCode: stub.departmentCode ?? "",
          college: stub.college ?? "",
          chargeAccount: account?.code ?? "",
          chargeAccountName: account?.name ?? "Unassigned",
          chargeAccountDepartment: account?.departmentCode ?? "",
          payPeriodStart: stub.periodStart.toISOString().slice(0, 10),
          payPeriodEnd: stub.periodEnd.toISOString().slice(0, 10),
          hourlyRate: stub.hourlyRateCents === null ? "" : centsToDollarString(stub.hourlyRateCents),
          regularHours: minutesToHourString(regularMinutes[index]),
          regularPay: centsToDollarString(regularPay[index]),
          overtimeHours: minutesToHourString(overtimeMinutes[index]),
          overtimePay: centsToDollarString(overtimePay[index]),
          totalHours: minutesToHourString(totalMinutes),
          totalPay: centsToDollarString(totalCents),
          payrollStatus: stub.status,
          reviewStatus: stub.reviewStatus,
          reviewedBy: stub.reviewedById ? reviewerNames.get(stub.reviewedById) ?? "" : "",
          reviewReason: stub.reviewReason ?? "",
        },
      };
    });
  });

  const accountFilter = filter.chargeAccountIds?.length ? new Set(filter.chargeAccountIds) : null;
  return lines
    .filter(({ chargeAccountId }) => !accountFilter || (chargeAccountId !== null && accountFilter.has(chargeAccountId)))
    .map(({ line }) => line);
}

export type PayrollReportLine = Awaited<ReturnType<typeof buildPayrollReportRows>>[number];

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
