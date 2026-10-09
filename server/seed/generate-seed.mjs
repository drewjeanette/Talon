// Generates seed/seed.sql, including real scrypt password hashes for the demo
// accounts. Run with: npm run db:seed:generate
//
// Dates are relative to when this runs, so regenerate before a demo.
//
// Hashes are produced here with the same Web Crypto algorithm and the same
// self-describing format the Worker verifies against, so they interoperate.
//
// Timestamps are unix SECONDS because the Drizzle schema uses
// integer({ mode: "timestamp" }), which stores seconds.

import { writeFileSync } from "node:fs";
import { scrypt as nodeScrypt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { INITIAL_DEPARTMENT_CODES } from "./departmentCodes.mjs";

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const scrypt = promisify(nodeScrypt);

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await scrypt(password, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toBase64(salt)}$${toBase64(key)}`;
}

/** Escapes a value for a single-quoted SQL string literal. */
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

const now = Math.floor(Date.now() / 1000);
const DAY = 86_400;
const HOUR = 3_600;

// Pay periods are anchored to real weekdays so the demo looks like payroll:
// bi-weekly periods run Monday through the Sunday payroll closes. Times are
// UTC; 14:00 UTC is 9 AM in Cookeville during daylight time.
const todayUtc = Math.floor(now / DAY) * DAY;
const weekday = new Date(todayUtc * 1000).getUTCDay(); // 0 = Sunday
const currentEnd = todayUtc + ((7 - weekday) % 7) * DAY; // this coming Sunday (or today)
const currentStart = currentEnd - 13 * DAY; // Monday
const previousStart = currentStart - 14 * DAY;
const previousEnd = currentStart - DAY;
const endOfDay = (day) => day + DAY - 1;
const todayDate = new Date(todayUtc * 1000);
const monthStart = (offset) => Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + offset, 1) / 1000;

// ---------- People ----------
// Two departments (CSC, MATH), two supervisors, and students that show:
//   * Chris and Sophie: same rate, different pay (Sophie has overtime)
//   * Sophie: home department CSC, paid from a MATH research grant
//   * Liz: supervised by both supervisors, and split across two accounts
//   * William: a monthly-paid hourly student, so monthly reports have hours
const ACCOUNTS = [
  { id: 1, code: "110245", name: "Computer Science Student Workers", dept: "CSC" },
  { id: 2, code: "120310", name: "Mathematics Tutoring Center", dept: "MATH" },
  { id: 3, code: "G21047", name: "NSF REU Research Grant", dept: "MATH" },
];

const people = [
  { id: 1, email: "admin@tntech.edu", firstName: "Renee", lastName: "Admin", role: "ADMIN", payType: "MONTHLY", salary: 6_500_000, dept: "CSC" },
  { id: 2, email: "supervisor@tntech.edu", firstName: "Sabrina", lastName: "Supervisor", role: "SUPERVISOR", payType: "MONTHLY", salary: 5_800_000, dept: "CSC" },
  { id: 3, email: "student@tntech.edu", firstName: "Chris", lastName: "Student", role: "STUDENT", payType: "BIWEEKLY", rate: 1150, dept: "CSC", account: 1, supervisors: [2] },
  { id: 4, email: "supervisor2@tntech.edu", firstName: "Marcus", lastName: "Reyes", role: "SUPERVISOR", payType: "MONTHLY", salary: 6_100_000, dept: "MATH" },
  { id: 5, email: "sophia.wells@tntech.edu", firstName: "Sophia", preferredName: "Sophie", lastName: "Wells", role: "STUDENT", payType: "BIWEEKLY", rate: 1150, dept: "CSC", account: 3, supervisors: [2] },
  { id: 6, email: "robert.hale@tntech.edu", firstName: "Robert", lastName: "Hale", role: "STUDENT", payType: "BIWEEKLY", rate: 1200, dept: "MATH", account: 2, supervisors: [4] },
  { id: 7, email: "christopher.lane@tntech.edu", firstName: "Christopher", lastName: "Lane", role: "STUDENT", payType: "BIWEEKLY", rate: 1200, dept: "MATH", account: 2, supervisors: [4] },
  { id: 8, email: "elizabeth.park@tntech.edu", firstName: "Elizabeth", preferredName: "Liz", lastName: "Park", role: "STUDENT", payType: "BIWEEKLY", rate: 1150, dept: "CSC", account: 1, supervisors: [2, 4] },
  { id: 9, email: "william.turner@tntech.edu", firstName: "William", lastName: "Turner", role: "STUDENT", payType: "MONTHLY", rate: 1325, dept: "MATH", account: 3, supervisors: [4] },
  { id: 10, email: "katherine.diaz@tntech.edu", firstName: "Katherine", lastName: "Diaz", role: "STUDENT", payType: "BIWEEKLY", rate: 1100, dept: "CSC", account: 1, supervisors: [2] },
  { id: 11, email: "richard.moss@tntech.edu", firstName: "Richard", lastName: "Moss", role: "STUDENT", payType: "BIWEEKLY", rate: 1100, dept: "MATH", account: 2, supervisors: [4] },
];
const DEMO_PASSWORD = "password123";

const lines = [
  "-- Generated by seed/generate-seed.mjs - do not edit by hand.",
  "-- Demo passwords are in the README; rotate them before using real data.",
  "",
  "DELETE FROM reminder_runs;",
  "DELETE FROM notifications;",
  "DELETE FROM notification_preferences;",
  "DELETE FROM password_reset_tokens;",
  "DELETE FROM audit_logs;",
  "DELETE FROM report_runs;",
  "DELETE FROM pay_stubs;",
  "DELETE FROM pay_periods;",
  "DELETE FROM time_entry_change_requests;",
  "DELETE FROM time_entries;",
  "DELETE FROM refresh_tokens;",
  "DELETE FROM user_profile_photos;",
  "DELETE FROM app_settings;",
  "DELETE FROM student_supervisors;",
  "DELETE FROM student_jobs;",
  "DELETE FROM users;",
  "DELETE FROM charge_accounts;",
  "DELETE FROM departments;",
  "DELETE FROM colleges;",
  "",
  "-- Colleges",
  `INSERT INTO colleges (id, name, code, created_at, updated_at) VALUES (1, 'College of Engineering', 'COE', ${now}, ${now});`,
  `INSERT INTO colleges (id, name, code, created_at, updated_at) VALUES (2, 'College of Arts & Sciences', 'CAS', ${now}, ${now});`,
  "",
  "-- Departments: full registrar code list. CSC and MATH get real names and a",
  "-- college so the demo shows both assigned and unassigned states.",
];

INITIAL_DEPARTMENT_CODES.forEach((code, index) => {
  const id = index + 1;
  let name = code;
  let collegeId = "NULL";
  if (code === "CSC") {
    name = "Computer Science";
    collegeId = "1";
  } else if (code === "MATH") {
    name = "Mathematics";
    collegeId = "2";
  }
  lines.push(
    `INSERT INTO departments (id, name, code, college_id, is_active, created_at, updated_at) VALUES (${id}, ${q(name)}, ${q(code)}, ${collegeId}, 1, ${now}, ${now});`
  );
});

const departmentId = (code) => INITIAL_DEPARTMENT_CODES.indexOf(code) + 1;

lines.push("", "-- Charge accounts (Banner index codes)");
for (const account of ACCOUNTS) {
  lines.push(
    `INSERT INTO charge_accounts (id, code, name, department_id, is_active, created_at, updated_at) VALUES (${account.id}, ${q(account.code)}, ${q(account.name)}, ${departmentId(account.dept)}, 1, ${now}, ${now});`
  );
}

lines.push("", "-- Demo users (all share the demo password)");
const hash = await hashPassword(DEMO_PASSWORD);
for (const person of people) {
  lines.push(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, preferred_name, role, pay_type, hourly_rate_cents, annual_salary_cents, department_id, charge_account_id, is_active, must_reset_pw, created_at, updated_at) VALUES (${person.id}, ${q(person.email)}, ${q(hash)}, ${q(person.firstName)}, ${q(person.lastName)}, ${person.preferredName ? q(person.preferredName) : "NULL"}, ${q(person.role)}, ${q(person.payType)}, ${person.rate ?? "NULL"}, ${person.salary ?? "NULL"}, ${departmentId(person.dept)}, ${person.account ?? "NULL"}, 1, 0, ${now}, ${now});`
  );
}

lines.push("", "-- Supervisor assignments (Liz has two supervisors; either can approve)");
for (const person of people) {
  for (const supervisorId of person.supervisors ?? []) {
    lines.push(`INSERT INTO student_supervisors (student_id, supervisor_id, created_at) VALUES (${person.id}, ${supervisorId}, ${now});`);
  }
}

// Jobs: one per student, except Liz, who is a CS lab assistant and a math tutor.
const jobs = [];
for (const person of people.filter((p) => p.role === "STUDENT")) {
  const account = ACCOUNTS.find((a) => a.id === person.account);
  jobs.push({ id: jobs.length + 1, userId: person.id, title: person.id === 8 ? "CS Lab Assistant" : account.name, account: person.account });
  if (person.id === 8) jobs.push({ id: jobs.length + 1, userId: 8, title: "Math Tutor", account: 2 });
}
const jobFor = (userId, account) => jobs.find((j) => j.userId === userId && j.account === account) ?? jobs.find((j) => j.userId === userId);
lines.push("", "-- Student jobs (Liz has two, so she picks one when clocking in)");
for (const job of jobs) {
  lines.push(`INSERT INTO student_jobs (id, user_id, title, charge_account_id, is_active, created_at, updated_at) VALUES (${job.id}, ${job.userId}, ${q(job.title)}, ${job.account}, 1, ${now}, ${now});`);
}

// ---------- Time ----------
const entries = [];
/** A shift on `day` (unix seconds at UTC midnight) from `startHour` for `hours`. */
function shift(userId, day, startHour, hours, status = "APPROVED", account) {
  const person = people.find((p) => p.id === userId);
  const clockIn = day + startHour * HOUR;
  entries.push({
    id: entries.length + 1,
    userId,
    clockIn,
    clockOut: clockIn + Math.round(hours * HOUR),
    status,
    account: account ?? person.account,
    editedBy: status === "PENDING" ? null : person.supervisors[0],
  });
}

// Previous bi-weekly period (already generated, waiting for review).
const P = previousStart;
shift(3, P, 14, 5); shift(3, P + 2 * DAY, 14, 5); shift(3, P + 8 * DAY, 14, 5); shift(3, P + 10 * DAY, 14, 5);
for (let d = 0; d < 5; d++) shift(5, P + d * DAY, 13, 9); // 45 hours in one week: 5 hours of overtime
shift(5, P + 8 * DAY, 14, 4);
shift(6, P, 18, 4); shift(6, P + 3 * DAY, 18, 4); shift(6, P + 7 * DAY, 18, 4); shift(6, P + 9 * DAY, 18, 4);
shift(7, P + 1 * DAY, 15, 6); shift(7, P + 4 * DAY, 15, 6); shift(7, P + 8 * DAY, 15, 6);
shift(8, P + 1 * DAY, 14, 6); shift(8, P + 3 * DAY, 14, 6); shift(8, P + 9 * DAY, 19, 4, "APPROVED", 2); // Liz also tutors for MATH
shift(10, P + 2 * DAY, 15, 5); shift(10, P + 9 * DAY, 15, 5);
shift(11, P + 1 * DAY, 19, 4); shift(11, P + 8 * DAY, 19, 4);

// Previous month for the monthly-paid student.
const previousMonthStart = monthStart(-1);
for (let week = 0; week < 4; week++) {
  shift(9, previousMonthStart + (week * 7 + 1) * DAY, 15, 6);
  shift(9, previousMonthStart + (week * 7 + 3) * DAY, 15, 6);
}

// Current period: earlier shifts approved, the last two days still pending.
for (let day = currentStart; day < todayUtc; day += DAY) {
  const dow = new Date(day * 1000).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  const status = day >= todayUtc - 2 * DAY ? "PENDING" : "APPROVED";
  if (dow === 1 || dow === 3) shift(3, day, 14, 5, status);
  if (dow === 2 || dow === 4) shift(5, day, 14, 6, status);
  if (dow === 1 || dow === 4) shift(6, day, 18, 4, status);
  if (dow === 3) shift(8, day, 14, 5, status);
  if (dow === 2) shift(9, day, 15, 6, status);
}
// Always something to approve, whatever weekday the seed runs on.
shift(3, todayUtc - DAY, 20, 3, "PENDING");
shift(6, todayUtc - DAY, 19, 3, "PENDING");
shift(8, todayUtc - DAY, 21, 2, "PENDING");
// A rejected shift Katherine still needs to correct.
shift(10, todayUtc - 3 * DAY, 15, 9, "REJECTED");

lines.push("", "-- Time entries");
for (const e of entries) {
  const rejection = e.status === "REJECTED" ? q("Clock-out was left running past the end of your shift.") : "NULL";
  lines.push(
    `INSERT INTO time_entries (id, user_id, clock_in, clock_out, source, status, job_id, charge_account_id, edited_by_id, rejection_reason, created_at, updated_at) VALUES (${e.id}, ${e.userId}, ${e.clockIn}, ${e.clockOut}, 'WEB', ${q(e.status)}, ${jobFor(e.userId, e.account).id}, ${e.account}, ${e.editedBy ?? "NULL"}, ${rejection}, ${e.clockIn}, ${e.status === "PENDING" ? e.clockOut : e.clockOut + 4 * HOUR});`
  );
}

lines.push("", "-- Correction requests awaiting a supervisor");
lines.push(
  `INSERT INTO time_entry_change_requests (id, user_id, time_entry_id, requested_clock_in, requested_clock_out, reason, status, created_at, updated_at) VALUES (1, 5, NULL, ${todayUtc - 2 * DAY + 18 * HOUR}, ${todayUtc - 2 * DAY + 21 * HOUR}, 'I worked the evening lab shift but the kiosk was down.', 'PENDING', ${now - 26 * HOUR}, ${now - 26 * HOUR});`,
  `INSERT INTO time_entry_change_requests (id, user_id, time_entry_id, requested_clock_in, requested_clock_out, reason, status, created_at, updated_at) VALUES (2, 7, NULL, ${todayUtc - 4 * DAY + 15 * HOUR}, ${todayUtc - 4 * DAY + 19 * HOUR}, 'Forgot to clock in for my tutoring hours.', 'PENDING', ${now - 3 * DAY}, ${now - 3 * DAY});`
);

// ---------- Pay periods and stubs ----------
const periods = [
  // Ids 1 and 2 are the open periods, as before.
  { id: 1, type: "BIWEEKLY", start: currentStart, end: endOfDay(currentEnd), pay: currentEnd + 5 * DAY, status: "OPEN" },
  { id: 2, type: "MONTHLY", start: monthStart(0), end: monthStart(1) - 1, pay: monthStart(1) - DAY, status: "OPEN" },
  { id: 3, type: "BIWEEKLY", start: previousStart, end: endOfDay(previousEnd), pay: previousEnd + 5 * DAY, status: "PROCESSING" },
  { id: 4, type: "MONTHLY", start: monthStart(-1), end: monthStart(0) - 1, pay: monthStart(0) - DAY, status: "PROCESSING" },
];
lines.push("", "-- Pay periods");
for (const period of periods) {
  lines.push(
    `INSERT INTO pay_periods (id, type, start_date, end_date, pay_date, status, created_at, updated_at) VALUES (${period.id}, ${q(period.type)}, ${period.start}, ${period.end}, ${period.pay}, ${q(period.status)}, ${now}, ${now});`
  );
}

// Same rules as services/payroll.service.ts: 40 hours per Sunday-anchored week,
// overtime at 1.5x, cents rounded once per line.
function weekKey(seconds) {
  const date = new Date(seconds * 1000);
  return Math.floor(seconds / DAY) - date.getUTCDay();
}
function stubFor(person, period) {
  const minutesByWeek = new Map();
  for (const e of entries) {
    if (e.userId !== person.id || e.status !== "APPROVED" || e.clockIn < period.start || e.clockIn > period.end) continue;
    const key = weekKey(e.clockIn);
    minutesByWeek.set(key, (minutesByWeek.get(key) ?? 0) + Math.round((e.clockOut - e.clockIn) / 60));
  }
  let regular = 0;
  let overtime = 0;
  for (const minutes of minutesByWeek.values()) {
    regular += Math.min(minutes, 40 * 60);
    overtime += Math.max(minutes - 40 * 60, 0);
  }
  if (period.type === "MONTHLY" && person.salary) {
    const gross = Math.round(person.salary / 12);
    return { regular, overtime, rate: null, regularPay: gross, overtimePay: 0 };
  }
  const regularPay = Math.round((regular * person.rate) / 60);
  const overtimePay = Math.round((overtime * person.rate * 1.5) / 60);
  return { regular, overtime, rate: person.rate, regularPay, overtimePay };
}

lines.push("", "-- Pay stubs for the generated periods (review pending unless noted)");
let stubId = 0;
const reviewed = { 3: { status: "APPROVED", by: 2 } }; // Sabrina already approved Chris
const flagged = { 11: "Hours look low for this period. Was a tutoring shift missed?" };
for (const period of periods.filter((p) => p.status === "PROCESSING")) {
  for (const person of people.filter((p) => p.payType === period.type)) {
    const stub = stubFor(person, period);
    const review = person.role === "STUDENT" && period.type === "BIWEEKLY" ? reviewed[person.id] : undefined;
    const flag = period.type === "BIWEEKLY" ? flagged[person.id] : undefined;
    stubId++;
    lines.push(
      `INSERT INTO pay_stubs (id, user_id, pay_period_id, regular_minutes, overtime_minutes, hourly_rate_cents, regular_pay_cents, overtime_pay_cents, gross_pay_cents, status, generated_at, review_status, reviewed_by_id, reviewed_at, flag_note, flagged_by_id, flagged_at) VALUES (${stubId}, ${person.id}, ${period.id}, ${stub.regular}, ${stub.overtime}, ${stub.rate ?? "NULL"}, ${stub.regularPay}, ${stub.overtimePay}, ${stub.regularPay + stub.overtimePay}, 'DRAFT', ${now - DAY}, ${q(review?.status ?? "PENDING")}, ${review?.by ?? "NULL"}, ${review ? now - 12 * HOUR : "NULL"}, ${flag ? q(flag) : "NULL"}, ${flag ? 1 : "NULL"}, ${flag ? now - 20 * HOUR : "NULL"});`
    );
  }
}

lines.push("", "-- Each supervisor has a payroll report to check (cleared when they open it)");
for (const supervisor of people.filter((p) => p.role === "SUPERVISOR")) {
  lines.push(
    `INSERT INTO notifications (recipient_user_id, sender_user_id, type, title, body, action, requires_action, created_at) VALUES (${supervisor.id}, 1, 'REPORT_READY', 'Payroll report ready', 'Please review the payroll report for your students.', 'OPEN_REPORT', 1, ${now - 6 * HOUR});`
  );
}

// Optional output path (the e2e server writes a fresh copy so dates are current).
const outPath = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "seed.sql");
writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Departments: ${INITIAL_DEPARTMENT_CODES.length}, users: ${people.length}, time entries: ${entries.length}, pay stubs: ${stubId}`);
console.log(`Password hashes: scrypt N=${SCRYPT_N}, r=${SCRYPT_R}, p=${SCRYPT_P}`);
