export interface TimecardPeriod { startDate: string; endDate: string }

const DAY = 86_400_000;
const centralDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Calendar days avoid browser timezone and daylight-saving changes to period length. */
export function payrollDay(value: string | number): number {
  const parts = centralDate.formatToParts(new Date(value));
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

export function timecardPeriods(periods: TimecardPeriod[]) {
  // Payroll calendar dates use UTC date labels, as do payroll reminders.
  const calendar = periods.map(period => ({
    start: Date.parse(period.startDate.slice(0, 10)),
    end: Date.parse(period.endDate.slice(0, 10)),
  })).sort((a, b) => b.start - a.start);
  return (day: number) => {
    const configured = calendar.find(period => day >= period.start && day <= period.end);
    if (configured) return configured;
    // Continue the saved biweekly cycle when the next period has not been created yet.
    const anchor = calendar.find(period => period.start <= day) ?? calendar.at(-1);
    if (!anchor) return null;
    const start = anchor.start + Math.floor((day - anchor.start) / (14 * DAY)) * 14 * DAY;
    return { start, end: start + 13 * DAY };
  };
}

export function timecardDate(day: number): string {
  return new Date(day).toLocaleDateString(undefined, { timeZone: "UTC" });
}
