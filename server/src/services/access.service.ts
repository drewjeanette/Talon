import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/index.js";
import { studentSupervisors, users } from "../db/schema.js";
import type { Role } from "../lib/jwt.js";

/**
 * Who may act on a student's time and pay: any admin, or any supervisor
 * assigned to that student. There is no primary supervisor.
 */

/** Subquery of the student ids a supervisor is assigned to, for `inArray(...)`. */
export function supervisedStudentIds(db: Db, supervisorId: number) {
  return db
    .select({ id: studentSupervisors.studentId })
    .from(studentSupervisors)
    .where(eq(studentSupervisors.supervisorId, supervisorId));
}

export async function isAssignedSupervisor(db: Db, supervisorId: number, studentId: number): Promise<boolean> {
  const row = await db
    .select({ id: studentSupervisors.studentId })
    .from(studentSupervisors)
    .where(and(eq(studentSupervisors.supervisorId, supervisorId), eq(studentSupervisors.studentId, studentId)))
    .get();
  return Boolean(row);
}

/** Throws 403 unless `me` is an admin or one of the student's supervisors. */
export async function assertCanManageStudent(db: Db, me: { id: number; role: Role }, studentId: number) {
  if (me.role === "ADMIN") return;
  if (me.role === "SUPERVISOR" && (await isAssignedSupervisor(db, me.id, studentId))) return;
  throw new HTTPException(403, { message: "You are not assigned to this student." });
}

/** "Sophia (Sophie) Wells" when a preferred name differs, else "Sophia Wells". */
export function fullName(person: { firstName: string; lastName: string; preferredName?: string | null }): string {
  const preferred = person.preferredName?.trim();
  return preferred && preferred.toLowerCase() !== person.firstName.toLowerCase()
    ? `${person.firstName} (${preferred}) ${person.lastName}`
    : `${person.firstName} ${person.lastName}`;
}

/** Every active supervisor assigned to each of the given students. */
export async function supervisorsByStudent(db: Db, studentIds: number[]) {
  const map = new Map<number, { id: number; name: string; email: string }[]>();
  if (studentIds.length === 0) return map;
  const rows = await db
    .select({
      studentId: studentSupervisors.studentId,
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      preferredName: users.preferredName,
      email: users.email,
    })
    .from(studentSupervisors)
    .innerJoin(users, eq(studentSupervisors.supervisorId, users.id))
    .where(and(inArray(studentSupervisors.studentId, studentIds), eq(users.isActive, true)))
    .orderBy(users.lastName, users.firstName);
  for (const row of rows) {
    const list = map.get(row.studentId) ?? [];
    list.push({ id: row.id, name: fullName(row), email: row.email });
    map.set(row.studentId, list);
  }
  return map;
}
