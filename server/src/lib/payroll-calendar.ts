import { z } from "zod";

// When payroll reminder emails go out. Admins edit this in Settings → Payroll
// Calendar; it is stored in app_settings under PAYROLL_CALENDAR_KEY. Times are
// US Central wall-clock "HH:MM".

export const PAYROLL_CALENDAR_KEY = "payroll_calendar";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00.");
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

/** On deadline day the morning reminder, escalation, and deadline must come in that order. */
function inOrder<T extends { deadlineMorningTime: string; escalationTime: string; dueTime: string }>(value: T, context: z.RefinementCtx) {
  if (!(minutes(value.deadlineMorningTime) < minutes(value.escalationTime) && minutes(value.escalationTime) < minutes(value.dueTime))) {
    context.addIssue({ code: "custom", path: ["escalationTime"], message: "On deadline day the reminder must come before the escalation, and the escalation before approvals are due." });
  }
}

export const payrollCalendarSchema = z.object({
  /** Off stops all scheduled reminder emails (the manual "Email supervisors now" still works). */
  enabled: z.boolean(),
  biweekly: z.object({
    /** Days before the period closes (Sunday) for the first reminder: 2 = Friday. */
    advanceDaysBeforeClose: z.number().int().min(0).max(7),
    advanceTime: time,
    /** Days after the close that approvals are due: 1 = Monday. */
    dueDaysAfterClose: z.number().int().min(0).max(3),
    deadlineMorningTime: time,
    escalationTime: time,
    dueTime: time,
  }).superRefine(inOrder),
  monthly: z.object({
    /** Day of the month approvals are due; moved to the Friday before when it falls on a weekend. */
    dueDayOfMonth: z.number().int().min(1).max(28),
    advanceBusinessDays: z.number().int().min(0).max(10),
    advanceTime: time,
    deadlineMorningTime: time,
    escalationTime: time,
    dueTime: time,
  }).superRefine(inOrder),
});

export type PayrollCalendar = z.infer<typeof payrollCalendarSchema>;

export const DEFAULT_PAYROLL_CALENDAR: PayrollCalendar = {
  enabled: true,
  biweekly: { advanceDaysBeforeClose: 2, advanceTime: "09:00", dueDaysAfterClose: 1, deadlineMorningTime: "08:00", escalationTime: "10:00", dueTime: "12:00" },
  monthly: { dueDayOfMonth: 25, advanceBusinessDays: 2, advanceTime: "09:00", deadlineMorningTime: "08:00", escalationTime: "10:00", dueTime: "12:00" },
};

/** The saved calendar, or the defaults if none was saved or it no longer validates. */
export function readPayrollCalendar(saved: unknown): PayrollCalendar {
  const parsed = payrollCalendarSchema.safeParse(saved);
  return parsed.success ? parsed.data : DEFAULT_PAYROLL_CALENDAR;
}
