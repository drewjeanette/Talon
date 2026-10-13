import { minutesBetween } from "./money.js";

// Overtime rules and charge-account attribution, shared by stub generation and
// payroll reports so the two can never disagree.

export const WEEKLY_OVERTIME_THRESHOLD_MINUTES = 40 * 60;
export const OVERTIME_MULTIPLIER = 1.5;

/** Sunday-anchored week key, used to apply the FLSA 40 hour/week threshold. */
export function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export interface WorkedEntry {
  clockIn: Date;
  clockOut: Date | null;
  chargeAccountId: number | null;
}

export interface AccountMinutes {
  chargeAccountId: number | null;
  regularMinutes: number;
  overtimeMinutes: number;
}

/**
 * Splits worked minutes into regular and overtime, week by week, and
 * attributes them to each entry's charge account. Within a week, shifts count
 * toward the 40 hours in the order they were worked, so overtime lands on the
 * account charged for the hours past 40.
 */
export function splitByAccount(entries: WorkedEntry[]): AccountMinutes[] {
  const sorted = entries
    .filter((entry) => entry.clockOut && minutesBetween(entry.clockIn, entry.clockOut) > 0)
    .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());

  const usedByWeek = new Map<string, number>();
  const byAccount = new Map<number | null, AccountMinutes>();
  for (const entry of sorted) {
    const minutes = minutesBetween(entry.clockIn, entry.clockOut!);
    const key = weekKey(entry.clockIn);
    const used = usedByWeek.get(key) ?? 0;
    const regular = Math.max(0, Math.min(minutes, WEEKLY_OVERTIME_THRESHOLD_MINUTES - used));
    usedByWeek.set(key, used + minutes);

    const totals = byAccount.get(entry.chargeAccountId) ?? { chargeAccountId: entry.chargeAccountId, regularMinutes: 0, overtimeMinutes: 0 };
    totals.regularMinutes += regular;
    totals.overtimeMinutes += minutes - regular;
    byAccount.set(entry.chargeAccountId, totals);
  }
  return [...byAccount.values()];
}

export function totalMinutes(split: AccountMinutes[]) {
  return split.reduce(
    (sum, row) => ({ regularMinutes: sum.regularMinutes + row.regularMinutes, overtimeMinutes: sum.overtimeMinutes + row.overtimeMinutes }),
    { regularMinutes: 0, overtimeMinutes: 0 }
  );
}

/**
 * Splits an integer total across weights so the parts are integers that add
 * up exactly (largest remainder). Used to divide a stub's cents and minutes
 * across charge accounts without losing or inventing a cent.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, index) => (index === 0 ? total : 0));
  const exact = weights.map((weight) => (total * weight) / sum);
  const parts = exact.map(Math.floor);
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    parts[index] += 1;
    remainder -= 1;
  }
  return parts;
}
