import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/index.js";
import { chargeAccounts, studentJobs, users } from "../db/schema.js";

export interface JobSummary {
  id: number;
  title: string;
  isActive: boolean;
  chargeAccount: { id: number; code: string; name: string } | null;
}

/** Jobs for each of the given students (active first, then by id). */
export async function jobsByUser(db: Db, userIds: number[], { includeInactive = false } = {}) {
  const map = new Map<number, JobSummary[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({
      id: studentJobs.id,
      userId: studentJobs.userId,
      title: studentJobs.title,
      isActive: studentJobs.isActive,
      accountId: chargeAccounts.id,
      accountCode: chargeAccounts.code,
      accountName: chargeAccounts.name,
    })
    .from(studentJobs)
    .leftJoin(chargeAccounts, eq(studentJobs.chargeAccountId, chargeAccounts.id))
    .where(and(inArray(studentJobs.userId, userIds), includeInactive ? undefined : eq(studentJobs.isActive, true)))
    .orderBy(asc(studentJobs.id));
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      isActive: row.isActive,
      chargeAccount: row.accountId ? { id: row.accountId, code: row.accountCode!, name: row.accountName! } : null,
    });
    map.set(row.userId, list);
  }
  return map;
}

/** One of the user's active jobs, or 422. */
export async function activeJobFor(db: Db, userId: number, jobId: number) {
  const job = await db.query.studentJobs.findFirst({
    where: and(eq(studentJobs.id, jobId), eq(studentJobs.userId, userId), eq(studentJobs.isActive, true)),
  });
  if (!job) throw new HTTPException(422, { message: "Choose one of your current jobs." });
  return job;
}

/**
 * Keeps users.charge_account_id (the account used when a shift has none) in
 * step with the student's first active job.
 */
export async function syncDefaultAccount(db: Db, userId: number) {
  const [first] = await db.select({ chargeAccountId: studentJobs.chargeAccountId }).from(studentJobs)
    .where(and(eq(studentJobs.userId, userId), eq(studentJobs.isActive, true)))
    .orderBy(asc(studentJobs.id)).limit(1);
  await db.update(users).set({ chargeAccountId: first?.chargeAccountId ?? null, updatedAt: new Date() }).where(eq(users.id, userId));
}
