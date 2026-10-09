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

// Only reminders that ask someone to do something. No confirmations ("you
// submitted X", "X was approved"): the business office asked for fewer emails.
export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    type: "TIME_FIX_REMINDER",
    label: "Time that needs fixing",
    description: "Before payroll closes, if a shift was rejected or you forgot to clock out.",
    roles: ["STUDENT"],
  },
  {
    type: "APPROVAL_REMINDER",
    label: "Approval reminders",
    description: "One summary before each payroll deadline listing every student waiting on your approval.",
    roles: ["SUPERVISOR"],
  },
  {
    type: "APPROVAL_ESCALATION",
    label: "Deadline escalations",
    description: "On deadline morning, if any of your students' time is still not approved.",
    roles: ["SUPERVISOR"],
  },
  {
    type: "PAYROLL_SUMMARY",
    label: "Payroll deadline summary",
    description: "On deadline morning, everything still waiting for approval across all departments.",
    roles: ["ADMIN"],
  },
  {
    type: "PAY_STUB_REJECTED",
    label: "Rejected pay stubs",
    description: "When a supervisor rejects a generated pay stub and it needs fixing.",
    roles: ["ADMIN"],
  },
];

export function notificationTypesFor(role: Role): NotificationType[] {
  return NOTIFICATION_TYPES.filter((t) => t.roles.includes(role));
}
