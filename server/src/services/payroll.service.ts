import { prisma } from "../config/prisma.js";
import type { PayPeriod, User } from "@prisma/client";
import { HttpError } from "../middleware/errorHandler.js";

const WEEKLY_OVERTIME_THRESHOLD_HOURS = 40;
const OVERTIME_MULTIPLIER = 1.5;
const MS_PER_HOUR = 1000 * 60 * 60;

function isoWeekKey(date: Date): string {
  // Group hours into Sun-Sat weeks for overtime calculation purposes.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

interface HourlyBreakdown {
  regularHours: number;
  overtimeHours: number;
}

/** Splits approved time-entry hours for a biweekly period into regular vs. overtime,
 * applying the FLSA 40-hour/week threshold per calendar week within the period. */
function computeHourlyBreakdown(entries: { clockIn: Date; clockOut: Date | null }[]): HourlyBreakdown {
  const hoursByWeek = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.clockOut) continue; // ignore entries still clocked in
    const hours = (entry.clockOut.getTime() - entry.clockIn.getTime()) / MS_PER_HOUR;
    const week = isoWeekKey(entry.clockIn);
    hoursByWeek.set(week, (hoursByWeek.get(week) ?? 0) + hours);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  for (const weekHours of hoursByWeek.values()) {
    regularHours += Math.min(weekHours, WEEKLY_OVERTIME_THRESHOLD_HOURS);
    overtimeHours += Math.max(weekHours - WEEKLY_OVERTIME_THRESHOLD_HOURS, 0);
  }

  return {
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
}

async function calculateBiweeklyPayStub(user: User, payPeriod: PayPeriod) {
  if (user.hourlyRate === null) {
    throw new HttpError(422, `User ${user.id} has no hourly rate set for biweekly pay.`);
  }
  const rate = Number(user.hourlyRate);

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: user.id,
      status: "APPROVED",
      clockIn: { gte: payPeriod.startDate, lte: payPeriod.endDate },
    },
    select: { clockIn: true, clockOut: true },
  });

  const { regularHours, overtimeHours } = computeHourlyBreakdown(entries);
  const grossPay = regularHours * rate + overtimeHours * rate * OVERTIME_MULTIPLIER;

  return { regularHours, overtimeHours, grossPay: Math.round(grossPay * 100) / 100 };
}

function calculateMonthlyPayStub(user: User) {
  if (user.annualSalary === null) {
    throw new HttpError(422, `User ${user.id} has no annual salary set for monthly pay.`);
  }
  const grossPay = Number(user.annualSalary) / 12;
  return { regularHours: 0, overtimeHours: 0, grossPay: Math.round(grossPay * 100) / 100 };
}

/** Generates (or regenerates) DRAFT pay stubs for every active user whose payType
 * matches the pay period, then returns the created/updated stubs. */
export async function generatePayStubsForPeriod(payPeriodId: number) {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new HttpError(404, "Pay period not found.");
  if (payPeriod.status === "CLOSED") throw new HttpError(409, "Pay period is already closed.");

  const users = await prisma.user.findMany({ where: { payType: payPeriod.type, isActive: true } });

  const stubs = [];
  for (const user of users) {
    const breakdown =
      payPeriod.type === "BIWEEKLY" ? await calculateBiweeklyPayStub(user, payPeriod) : calculateMonthlyPayStub(user);

    const stub = await prisma.payStub.upsert({
      where: { userId_payPeriodId: { userId: user.id, payPeriodId } },
      update: { ...breakdown, status: "DRAFT" },
      create: { userId: user.id, payPeriodId, ...breakdown, status: "DRAFT" },
    });
    stubs.push(stub);
  }

  await prisma.payPeriod.update({ where: { id: payPeriodId }, data: { status: "PROCESSING" } });
  return stubs;
}

export async function finalizePayPeriod(payPeriodId: number) {
  await prisma.payStub.updateMany({ where: { payPeriodId }, data: { status: "FINALIZED" } });
  return prisma.payPeriod.update({ where: { id: payPeriodId }, data: { status: "CLOSED" } });
}
