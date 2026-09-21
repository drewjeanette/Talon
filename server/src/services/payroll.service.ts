import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/index.js";
import { payPeriods, payStubs, timeEntries, users } from "../db/schema.js";
import { minutesBetween, payForMinutes } from "../lib/money.js";

const WEEKLY_OVERTIME_THRESHOLD_MINUTES = 40 * 60;
const OVERTIME_MULTIPLIER = 1.5;

/** Sunday-anchored week key, used to apply the FLSA 40 hour/week threshold. */
function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

interface Breakdown {
  regularMinutes: number;
  overtimeMinutes: number;
}

/** Splits a user's entries into regular vs overtime minutes, week by week. */
function splitRegularAndOvertime(entries: { clockIn: Date; clockOut: Date | null }[]): Breakdown {
  const minutesByWeek = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.clockOut) continue; // still clocked in - not payable yet
    const minutes = minutesBetween(entry.clockIn, entry.clockOut);
    if (minutes <= 0) continue;
    const key = weekKey(entry.clockIn);
    minutesByWeek.set(key, (minutesByWeek.get(key) ?? 0) + minutes);
  }

  let regularMinutes = 0;
  let overtimeMinutes = 0;
  for (const weekMinutes of minutesByWeek.values()) {
    regularMinutes += Math.min(weekMinutes, WEEKLY_OVERTIME_THRESHOLD_MINUTES);
    overtimeMinutes += Math.max(weekMinutes - WEEKLY_OVERTIME_THRESHOLD_MINUTES, 0);
  }
  return { regularMinutes, overtimeMinutes };
}

/**
 * Generates (or regenerates) DRAFT pay stubs for every active employee whose
 * pay type matches the period.
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
  const entries =
    period.type === "BIWEEKLY"
      ? await db
          .select({
            userId: timeEntries.userId,
            clockIn: timeEntries.clockIn,
            clockOut: timeEntries.clockOut,
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
          )
      : [];

  const entriesByUser = new Map<number, { clockIn: Date; clockOut: Date | null }[]>();
  for (const entry of entries) {
    const list = entriesByUser.get(entry.userId) ?? [];
    list.push({ clockIn: entry.clockIn, clockOut: entry.clockOut });
    entriesByUser.set(entry.userId, list);
  }

  const rows = employees.map((employee) => {
    if (period.type === "BIWEEKLY") {
      const rate = employee.hourlyRateCents;
      if (rate === null) {
        throw new HTTPException(422, {
          message: `${employee.email} has no hourly rate set for biweekly pay.`,
        });
      }
      const { regularMinutes, overtimeMinutes } = splitRegularAndOvertime(
        entriesByUser.get(employee.id) ?? []
      );
      const grossPayCents =
        payForMinutes(regularMinutes, rate) +
        payForMinutes(overtimeMinutes, rate, OVERTIME_MULTIPLIER);
      return { userId: employee.id, payPeriodId, regularMinutes, overtimeMinutes, grossPayCents };
    }

    const salary = employee.annualSalaryCents;
    if (salary === null) {
      throw new HTTPException(422, {
        message: `${employee.email} has no annual salary set for monthly pay.`,
      });
    }
    return {
      userId: employee.id,
      payPeriodId,
      regularMinutes: 0,
      overtimeMinutes: 0,
      grossPayCents: Math.round(salary / 12),
    };
  });

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
          grossPayCents: row.grossPayCents,
          status: "DRAFT" as const,
          finalizedById: null,
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
