// Date labels for the fall 2026 timecard cycle. Payroll processing dates are
// configured separately in pay_periods.
const fall2026 = [
  ["2026-08-31", "2026-09-13"],
  ["2026-09-14", "2026-09-27"],
  ["2026-09-28", "2026-10-11"],
  ["2026-10-12", "2026-10-25"],
  ["2026-10-26", "2026-11-08"],
  ["2026-11-09", "2026-11-22"],
  ["2026-11-23", "2026-12-06"],
].map(([start, end]) => ({
  startDate: new Date(`${start}T00:00:00Z`),
  endDate: new Date(`${end}T23:59:59Z`),
}));

export function timecardCalendar(saved: { startDate: Date; endDate: Date }[]) {
  const first = fall2026[0].startDate;
  const last = fall2026[fall2026.length - 1].endDate;
  const outsideFall = saved.filter((period) => period.endDate < first || period.startDate > last);
  return [...fall2026, ...outsideFall].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}
