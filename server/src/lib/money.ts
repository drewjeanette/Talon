// Money and worked-time conversions.
//
// Everything is stored as integers (cents, minutes) so payroll arithmetic is
// exact. Floating point dollars drift: 0.1 + 0.2 !== 0.3, and over hundreds of
// pay stubs that becomes real money. Convert only at the API boundary.

/** "12.50" or 12.5 -> 1250 cents. Throws on values that are not valid money. */
export function dollarsToCents(dollars: number | string): number {
  const value = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(value)) throw new Error(`Invalid money value: ${dollars}`);
  // Round rather than truncate so 0.1*3 style inputs land on the right cent.
  return Math.round(value * 100);
}

/** 1250 -> "12.50" (always two decimal places, suitable for display/CSV). */
export function centsToDollarString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Whole minutes between two instants, rounded to the nearest minute. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

/** 90 -> "1.50" hours, for display and reporting. */
export function minutesToHourString(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/**
 * Pay for a number of minutes at a cents-per-hour rate, rounded to the nearest
 * cent. `multiplier` supports overtime (1.5). Kept in integer space as long as
 * possible, with a single rounding step at the end.
 */
export function payForMinutes(minutes: number, rateCentsPerHour: number, multiplier = 1): number {
  return Math.round((minutes * rateCentsPerHour * multiplier) / 60);
}
