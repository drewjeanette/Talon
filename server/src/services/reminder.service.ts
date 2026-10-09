import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, type Db } from "../db/index.js";
import { appSettings, notificationPreferences, payPeriods, reminderRuns, users } from "../db/schema.js";
import { PAYROLL_CALENDAR_KEY, readPayrollCalendar, type PayrollCalendar } from "../lib/payroll-calendar.js";
import { escapeHtml, getEmailSender, type EmailMessage } from "../lib/email.js";
import type { Bindings } from "../types.js";
import { fullName, supervisorsByStudent } from "./access.service.js";
import { layout } from "./email.service.js";

// Payroll deadline reminders. Only sent when something still needs doing, and
// batched: one summary per supervisor, never one email per student.
//
// When they go out is the payroll calendar admins edit in Settings (see
// lib/payroll-calendar.ts). Defaults:
// Bi-weekly: payroll closes Sunday (the period end) and approvals are due by
// noon Monday. Reminders go out the Friday before, Monday morning, and an
// escalation at 10 AM Monday for anything still unapproved.
// Monthly: approvals are due the 25th (the Friday before, if the 25th is on a
// weekend), with the first reminder two business days earlier.
// Times are US Central (Tennessee Tech, Cookeville).

export const PAYROLL_TIME_ZONE = "America/Chicago";

export type ReminderStage = "advance" | "deadline-morning" | "escalation";

export interface ScheduledReminder {
  stage: ReminderStage;
  at: Date;
  deadline: Date;
}

/** The UTC instant for a wall-clock time in the payroll time zone. */
export function centralTime(year: number, month: number, day: number, hour: number, minute = 0): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset, including on daylight-saving change days.
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: PAYROLL_TIME_ZONE, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    guess += Date.UTC(year, month - 1, day, hour, minute) - shown;
  }
  return new Date(guess);
}

/** Calendar date arithmetic on a UTC date (no time-of-day). */
function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function minusBusinessDays(date: Date, days: number): Date {
  let result = date;
  while (days > 0) {
    result = addDays(result, -1);
    if (result.getUTCDay() !== 0 && result.getUTCDay() !== 6) days--;
  }
  return result;
}

/** A "HH:MM" Central wall-clock time on a calendar date. */
const at = (date: Date, time: string) =>
  centralTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), Number(time.slice(0, 2)), Number(time.slice(3)));

/**
 * When each reminder for a pay period goes out. Pay period dates come from
 * date pickers (midnight UTC), so the UTC calendar date is the payroll date.
 */
export function reminderSchedule(period: { type: "BIWEEKLY" | "MONTHLY"; endDate: Date }, calendar: PayrollCalendar): ScheduledReminder[] {
  const end = new Date(Date.UTC(period.endDate.getUTCFullYear(), period.endDate.getUTCMonth(), period.endDate.getUTCDate()));
  if (period.type === "BIWEEKLY") {
    const c = calendar.biweekly;
    const deadlineDay = addDays(end, c.dueDaysAfterClose);
    const deadline = at(deadlineDay, c.dueTime);
    return [
      { stage: "advance", at: at(addDays(end, -c.advanceDaysBeforeClose), c.advanceTime), deadline },
      { stage: "deadline-morning", at: at(deadlineDay, c.deadlineMorningTime), deadline },
      { stage: "escalation", at: at(deadlineDay, c.escalationTime), deadline },
    ];
  }
  const c = calendar.monthly;
  let deadlineDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), c.dueDayOfMonth));
  while (deadlineDay.getUTCDay() === 0 || deadlineDay.getUTCDay() === 6) deadlineDay = addDays(deadlineDay, -1);
  const deadline = at(deadlineDay, c.dueTime);
  return [
    { stage: "advance", at: at(minusBusinessDays(deadlineDay, c.advanceBusinessDays), c.advanceTime), deadline },
    { stage: "deadline-morning", at: at(deadlineDay, c.deadlineMorningTime), deadline },
    { stage: "escalation", at: at(deadlineDay, c.escalationTime), deadline },
  ];
}

export async function loadPayrollCalendar(db: Db): Promise<PayrollCalendar> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, PAYROLL_CALENDAR_KEY) });
  return readPayrollCalendar(row?.value);
}

function formatDeadline(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PAYROLL_TIME_ZONE, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

interface PendingStudent {
  id: number;
  name: string;
  entries: number;
  corrections: number;
}

/** Students with time still waiting for approval, optionally limited to one pay cycle and cutoff. */
async function pendingStudents(env: Bindings, payType: "BIWEEKLY" | "MONTHLY" | null, cutoff: Date | null): Promise<PendingStudent[]> {
  const cutoffSeconds = cutoff ? Math.floor(cutoff.getTime() / 1000) : null;
  const result = await env.DB.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.preferred_name,
      (SELECT COUNT(*) FROM time_entries e WHERE e.user_id = u.id AND e.status = 'PENDING'
         AND e.clock_out IS NOT NULL AND (?1 IS NULL OR e.clock_in <= ?1)) AS entries,
      (SELECT COUNT(*) FROM time_entry_change_requests r WHERE r.user_id = u.id AND r.status = 'PENDING'
         AND (?1 IS NULL OR r.requested_clock_in <= ?1)) AS corrections
    FROM users u
    WHERE u.role = 'STUDENT' AND u.is_active = 1 AND (?2 IS NULL OR u.pay_type = ?2)
    ORDER BY u.last_name, u.first_name
  `).bind(cutoffSeconds, payType).all<{ id: number; first_name: string; last_name: string; preferred_name: string | null; entries: number; corrections: number }>();
  return result.results
    .filter((row) => row.entries + row.corrections > 0)
    .map((row) => ({
      id: row.id,
      name: fullName({ firstName: row.first_name, lastName: row.last_name, preferredName: row.preferred_name }),
      entries: row.entries,
      corrections: row.corrections,
    }));
}

/** Students whose own time needs fixing: a rejected shift with no correction sent, or a shift left open 12+ hours. */
async function studentsWithTimeToFix(env: Bindings, payType: "BIWEEKLY" | "MONTHLY" | null) {
  const result = await env.DB.prepare(`
    SELECT u.id,
      (SELECT COUNT(*) FROM time_entries e WHERE e.user_id = u.id AND e.status = 'REJECTED'
         AND e.updated_at > unixepoch() - 60 * 86400
         AND NOT EXISTS (SELECT 1 FROM time_entry_change_requests r WHERE r.time_entry_id = e.id AND r.created_at >= e.updated_at)) AS rejected,
      (SELECT COUNT(*) FROM time_entries e WHERE e.user_id = u.id AND e.clock_out IS NULL
         AND e.clock_in < unixepoch() - 12 * 3600) AS open_shifts
    FROM users u
    WHERE u.role = 'STUDENT' AND u.is_active = 1 AND (?1 IS NULL OR u.pay_type = ?1)
  `).bind(payType).all<{ id: number; rejected: number; open_shifts: number }>();
  return result.results.filter((row) => row.rejected + row.open_shifts > 0);
}

/** Recipients (active users) who have not switched off this email type. */
async function recipients(db: Db, ids: number[], type: string) {
  if (ids.length === 0) return new Map<number, { email: string; name: string }>();
  const [people, optedOut] = await Promise.all([
    db.select({ id: users.id, email: users.email, firstName: users.firstName, preferredName: users.preferredName })
      .from(users).where(and(inArray(users.id, ids), eq(users.isActive, true))),
    db.select({ userId: notificationPreferences.userId }).from(notificationPreferences)
      .where(and(inArray(notificationPreferences.userId, ids), eq(notificationPreferences.type, type), eq(notificationPreferences.emailEnabled, false))),
  ]);
  const off = new Set(optedOut.map((row) => row.userId));
  return new Map(people.filter((person) => !off.has(person.id)).map((person) => [person.id, { email: person.email, name: person.preferredName || person.firstName }]));
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A printable checklist table: one row per student with an empty checkbox. */
function checklistHtml(rows: { name: string; detail: string; extra?: string }[], extraHeading?: string): string {
  const cell = "padding:8px 10px;border:1px solid #d6d3de;text-align:left;vertical-align:top";
  const body = rows.map((row) => `<tr><td style="${cell};width:28px;font-size:18px">&#9744;</td><td style="${cell}"><strong>${escapeHtml(row.name)}</strong></td><td style="${cell}">${escapeHtml(row.detail)}</td>${extraHeading ? `<td style="${cell}">${escapeHtml(row.extra ?? "")}</td>` : ""}</tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%;margin:0 0 16px;font-size:14px"><thead><tr><th style="${cell};background:#efecf5">Done</th><th style="${cell};background:#efecf5">Student</th><th style="${cell};background:#efecf5">Waiting</th>${extraHeading ? `<th style="${cell};background:#efecf5">${escapeHtml(extraHeading)}</th>` : ""}</tr></thead><tbody>${body}</tbody></table>`;
}

function checklistText(rows: { name: string; detail: string; extra?: string }[]): string {
  return rows.map((row) => `[ ] ${row.name} - ${row.detail}${row.extra ? ` (${row.extra})` : ""}`).join("\n");
}

const waitingDetail = (student: PendingStudent) => [
  student.entries ? count(student.entries, "shift") : "",
  student.corrections ? count(student.corrections, "correction") : "",
].filter(Boolean).join(", ");

export interface ReminderResult {
  supervisors: number;
  admins: number;
  students: number;
}

/**
 * Builds and sends one round of reminders.
 *   advance / deadline-morning: one summary per supervisor + students with time to fix (advance only)
 *   escalation: every supervisor assigned to a still-pending student, plus one admin summary
 */
export async function sendApprovalReminders(
  env: Bindings,
  options: { stage: ReminderStage; deadline: Date | null; payType: "BIWEEKLY" | "MONTHLY" | null; cutoff: Date | null }
): Promise<ReminderResult> {
  const db = getDb(env.DB);
  const sender = getEmailSender(env);
  const base = (env.APP_URL || "https://talontime.org").replace(/\/$/, "");
  const due = options.deadline ? `due ${formatDeadline(options.deadline)}` : null;
  const dueSuffix = due ? ` (${due})` : "";
  const messages: EmailMessage[] = [];
  const result: ReminderResult = { supervisors: 0, admins: 0, students: 0 };

  const pending = await pendingStudents(env, options.payType, options.cutoff);
  const supervisors = await supervisorsByStudent(db, pending.map((student) => student.id));

  // Group pending students under every supervisor assigned to them.
  const bySupervisor = new Map<number, PendingStudent[]>();
  for (const student of pending) {
    for (const supervisor of supervisors.get(student.id) ?? []) {
      bySupervisor.set(supervisor.id, [...(bySupervisor.get(supervisor.id) ?? []), student]);
    }
  }

  const escalation = options.stage === "escalation";
  const supervisorType = escalation ? "APPROVAL_ESCALATION" : "APPROVAL_REMINDER";
  const supervisorRecipients = await recipients(db, [...bySupervisor.keys()], supervisorType);
  for (const [supervisorId, students] of bySupervisor) {
    const to = supervisorRecipients.get(supervisorId);
    if (!to) continue;
    const rows = students.map((student) => ({ name: student.name, detail: waitingDetail(student) }));
    const subject = escalation
      ? `Action needed: ${count(students.length, "student")} still waiting on your approval${dueSuffix}`
      : `Talon: ${count(students.length, "student")} waiting on your approval${dueSuffix}`;
    const paragraphs = [
      `Hi ${to.name},`,
      escalation
        ? `Payroll approvals are ${due ?? "due soon"}. These students still have time waiting for you or another of their supervisors. Any assigned supervisor can approve.`
        : `These students have time waiting for your approval.${due ? ` Approvals are ${due}.` : ""} Print this email to use as a checklist.`,
    ];
    messages.push({
      to: to.email,
      subject,
      text: `${paragraphs.join("\n\n")}\n\n${checklistText(rows)}\n\n${base}/`,
      html: layout(escalation ? "Approvals still needed" : "Time waiting for approval", paragraphs, { label: "Open approvals", url: `${base}/` }, checklistHtml(rows)),
    });
    result.supervisors++;
  }

  if (escalation && pending.length) {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));
    const adminRecipients = await recipients(db, admins.map((admin) => admin.id), "PAYROLL_SUMMARY");
    const rows = pending.map((student) => ({
      name: student.name,
      detail: waitingDetail(student),
      extra: (supervisors.get(student.id) ?? []).map((supervisor) => supervisor.name).join(", ") || "No supervisor assigned",
    }));
    for (const to of adminRecipients.values()) {
      const paragraphs = [
        `Hi ${to.name},`,
        `${count(pending.length, "student")} still ${pending.length === 1 ? "has" : "have"} time waiting for approval.${due ? ` Approvals are ${due}.` : ""} Their supervisors were sent an escalation.`,
      ];
      messages.push({
        to: to.email,
        subject: `Payroll summary: ${count(pending.length, "student")} not yet approved${dueSuffix}`,
        text: `${paragraphs.join("\n\n")}\n\n${checklistText(rows)}\n\n${base}/`,
        html: layout("Payroll approval summary", paragraphs, { label: "Open Talon", url: `${base}/` }, checklistHtml(rows, "Supervisors")),
      });
      result.admins++;
    }
  }

  if (options.stage === "advance") {
    const toFix = await studentsWithTimeToFix(env, options.payType);
    const studentRecipients = await recipients(db, toFix.map((row) => row.id), "TIME_FIX_REMINDER");
    for (const row of toFix) {
      const to = studentRecipients.get(row.id);
      if (!to) continue;
      const items = [
        row.rejected ? `${count(row.rejected, "shift was", "shifts were")} rejected. Send a correction with the right times.` : "",
        row.open_shifts ? "You are still clocked in from an earlier shift. Clock out, or send a correction if you forgot." : "",
      ].filter(Boolean);
      const paragraphs = [`Hi ${to.name},`, `Please fix your time before payroll closes${dueSuffix}.`, ...items];
      messages.push({
        to: to.email,
        subject: "Fix your time before payroll closes",
        text: `${paragraphs.join("\n\n")}\n\n${base}/`,
        html: layout("Your time needs a fix", paragraphs, { label: "Open Talon", url: `${base}/` }),
      });
      result.students++;
    }
  }

  const sent = await Promise.allSettled(messages.map((message) => sender.send(message)));
  for (const failure of sent.filter((outcome) => outcome.status === "rejected")) console.error("Reminder email failed:", failure.reason);
  return result;
}

/** Catch-up window: a stage still sends if a cron run was missed, but not days late. */
const SEND_WINDOW_MS = 6 * 3_600_000;

/** Runs from the hourly cron trigger. Sends each period's due stages exactly once. */
export async function runScheduledReminders(env: Bindings, now = new Date()) {
  const db = getDb(env.DB);
  const calendar = await loadPayrollCalendar(db);
  if (!calendar.enabled) return [];
  const periods = await db.select().from(payPeriods).where(ne(payPeriods.status, "CLOSED"));
  const results: { payPeriodId: number; stage: ReminderStage; result: ReminderResult }[] = [];

  for (const period of periods) {
    for (const reminder of reminderSchedule(period, calendar)) {
      const elapsed = now.getTime() - reminder.at.getTime();
      if (elapsed < 0 || elapsed >= SEND_WINDOW_MS) continue;
      // Claim the stage first so overlapping runs can't both send it.
      const claimed = await db.insert(reminderRuns).values({ payPeriodId: period.id, stage: reminder.stage })
        .onConflictDoNothing().returning({ id: reminderRuns.id });
      if (!claimed.length) continue;

      const result = await sendApprovalReminders(env, { stage: reminder.stage, deadline: reminder.deadline, payType: period.type, cutoff: period.endDate });
      await db.update(reminderRuns).set({ recipients: result.supervisors + result.admins + result.students }).where(eq(reminderRuns.id, claimed[0].id));
      results.push({ payPeriodId: period.id, stage: reminder.stage, result });
    }
  }
  return results;
}
