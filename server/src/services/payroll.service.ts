import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/index.js";
import { payPeriods, payStubs, timeEntries, users } from "../db/schema.js";
import { payForMinutes } from "../lib/money.js";
import { OVERTIME_MULTIPLIER, splitByAccount, totalMinutes, type WorkedEntry } from "../lib/payroll-math.js";

/**
 * Generates (or regenerates) DRAFT pay stubs for every active employee whose
 * pay type matches the period.
 *
 * Hours worked are recorded for both cycles because grant reporting needs
 * actual hours. Hourly workers are paid for them (overtime past 40/week);
 * salaried monthly staff are paid 1/12 of salary with their hours recorded.
 *
 * D1 counts each query as a subrequest, and the Workers Free plan allows only
 * 50 per invocation, so this deliberately runs a fixed number of queries
 * regardless of headcount: one for the employees, one for all of their time
 * entries, and one batch for the writes. Querying per employee in a loop -
 * which is how this worked on MySQL - would exceed the limit at ~48 employees.
 */
export async function generatePayStubsForPeriod(db: Db, payPeriodId: number) {
  const period = await db.query.payPeriods.findFirst({ where: eq(payPeriods.id, payPeriodId) });
  if (!period) throw new HTTPException(404, { message: "Pay period not found." });
  if (period.status === "CLOSED") {
    throw new HTTPException(409, { message: "Pay period is already closed." });
  }

  // Query 1: everyone on this pay cycle.
  const employees = await db
    .select()
    .from(users)
    .where(and(eq(users.payType, period.type), eq(users.isActive, true)));

  if (employees.length === 0) return { generated: 0 };

  // Query 2: every approved entry in range for all of them at once.
  const entries = await db
    .select({
      userId: timeEntries.userId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      chargeAccountId: timeEntries.chargeAccountId,
    })
    .from(timeEntries)
    .where(
      and(
        inArray(
          timeEntries.userId,
          employees.map((e) => e.id)
        ),
        eq(timeEntries.status, "APPROVED"),
        gte(timeEntries.clockIn, period.startDate),
        lte(timeEntries.clockIn, period.endDate)
      )
    );

  const entriesByUser = new Map<number, WorkedEntry[]>();
  for (const { userId, ...entry } of entries) {
    const list = entriesByUser.get(userId) ?? [];
    list.push(entry);
    entriesByUser.set(userId, list);
  }

  const rows = employees.map((employee) => {
    const { regularMinutes, overtimeMinutes } = totalMinutes(splitByAccount(entriesByUser.get(employee.id) ?? []));
    const salary = period.type === "MONTHLY" ? employee.annualSalaryCents : null;
    if (salary !== null) {
      const grossPayCents = Math.round(salary / 12);
      return { userId: employee.id, payPeriodId, regularMinutes, overtimeMinutes, hourlyRateCents: null, regularPayCents: grossPayCents, overtimePayCents: 0, grossPayCents };
    }

    const rate = employee.hourlyRateCents;
    if (rate === null) {
      throw new HTTPException(422, {
        message: period.type === "BIWEEKLY"
          ? `${employee.email} has no hourly rate set for biweekly pay.`
          : `${employee.email} has no annual salary or hourly rate set for monthly pay.`,
      });
    }
    const regularPayCents = payForMinutes(regularMinutes, rate);
    const overtimePayCents = payForMinutes(overtimeMinutes, rate, OVERTIME_MULTIPLIER);
    return {
      userId: employee.id,
      payPeriodId,
      regularMinutes,
      overtimeMinutes,
      hourlyRateCents: rate,
      regularPayCents,
      overtimePayCents,
      grossPayCents: regularPayCents + overtimePayCents,
    };
  });

  // A stub whose numbers changed, or that was rejected, goes back for review.
  const needsReview = sql`(${payStubs.grossPayCents} <> excluded.gross_pay_cents
    OR ${payStubs.regularMinutes} <> excluded.regular_minutes
    OR ${payStubs.overtimeMinutes} <> excluded.overtime_minutes
    OR ${payStubs.reviewStatus} = 'REJECTED')`;

  // One batch = one subrequest, and it commits atomically.
  const statements = rows.map((row) =>
    db
      .insert(payStubs)
      .values({ ...row, status: "DRAFT" as const })
      .onConflictDoUpdate({
        target: [payStubs.userId, payStubs.payPeriodId],
        set: {
          regularMinutes: row.regularMinutes,
          overtimeMinutes: row.overtimeMinutes,
          hourlyRateCents: row.hourlyRateCents,
          regularPayCents: row.regularPayCents,
          overtimePayCents: row.overtimePayCents,
          grossPayCents: row.grossPayCents,
          status: "DRAFT" as const,
          finalizedById: null,
          reviewStatus: sql`CASE WHEN ${needsReview} THEN 'PENDING' ELSE ${payStubs.reviewStatus} END`,
          reviewedById: sql`CASE WHEN ${needsReview} THEN NULL ELSE ${payStubs.reviewedById} END`,
          reviewedAt: sql`CASE WHEN ${needsReview} THEN NULL ELSE ${payStubs.reviewedAt} END`,
          reviewReason: sql`CASE WHEN ${needsReview} THEN NULL ELSE ${payStubs.reviewReason} END`,
        },
      })
  );

  await db.batch([
    ...(statements as [(typeof statements)[number], ...typeof statements]),
    db.update(payPeriods).set({ status: "PROCESSING" }).where(eq(payPeriods.id, payPeriodId)),
  ]);

  return { generated: rows.length };
}

export async function finalizePayPeriod(db: Db, payPeriodId: number, finalizedById: number) {
  await db.batch([
    db.update(payStubs).set({ status: "FINALIZED", finalizedById }).where(eq(payStubs.payPeriodId, payPeriodId)),
    db.update(payPeriods).set({ status: "CLOSED" }).where(eq(payPeriods.id, payPeriodId)),
  ]);

  return db.query.payPeriods.findFirst({ where: eq(payPeriods.id, payPeriodId) });
}
