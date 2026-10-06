import type { Role } from "./jwt.js";

// The email notifications a user can switch on or off in Settings. This is the
// single source of truth: the Settings page renders whatever this returns for
// the user's role, and emailNotification() refuses types not listed here.
//
// To add a notification: add an entry, then call emailNotification() with its
// type wherever the event happens. No migration or client change is needed.

export interface NotificationType {
  type: string;
  label: string;
  description: string;
  roles: Role[];
}

export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    type: "TIME_ENTRY_REVIEWED",
    label: "Time entry decisions",
    description: "When a supervisor approves or rejects one of your time entries.",
    roles: ["STUDENT"],
  },
  {
    type: "CORRECTION_REVIEWED",
    label: "Time correction decisions",
    description: "When a time correction you requested is approved or rejected.",
    roles: ["STUDENT"],
  },
  {
    type: "PAY_STUB_READY",
    label: "New pay stubs",
    description: "When a pay stub for a finalized pay period is available.",
    roles: ["STUDENT"],
  },
  {
    type: "TIME_ENTRY_SUBMITTED",
    label: "Entries awaiting approval",
    description: "When someone on your team submits time that needs your review.",
    roles: ["SUPERVISOR"],
  },
  {
    type: "CORRECTION_REQUESTED",
    label: "Time correction requests",
    description: "When someone on your team asks to correct a time entry.",
    roles: ["SUPERVISOR"],
  },
  {
    type: "REPORT_READY",
    label: "Payroll reports",
    description: "When a payroll report you requested is ready to download.",
    roles: ["SUPERVISOR"],
  },
  {
    type: "CLOCK_OUT",
    label: "Biweekly pay ready",
    description: "When an hourly worker clocks out and the current pay period needs finalizing.",
    roles: ["ADMIN"],
  },
  {
    type: "PAY_STUB_REJECTED",
    label: "Rejected pay stubs",
    description: "When a supervisor rejects a generated pay stub.",
    roles: ["ADMIN"],
  },
];

export function notificationTypesFor(role: Role): NotificationType[] {
  return NOTIFICATION_TYPES.filter((t) => t.roles.includes(role));
}
