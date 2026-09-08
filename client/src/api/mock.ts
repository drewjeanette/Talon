// Demo/mock backend for previewing the UI with no server, database, or Docker
// running at all. Activated by VITE_MOCK_MODE=true (see client/.env.example).
// Data lives in memory only and resets on page reload - this is a UI preview
// aid, not a substitute for the real API in server/.
import { ApiError } from "./errors";
import { INITIAL_DEPARTMENT_CODES } from "./departmentCodes";

export const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

type Role = "STUDENT" | "SUPERVISOR" | "ADMIN";
type PayType = "BIWEEKLY" | "MONTHLY";

interface MockUser {
  id: number;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  payType: PayType;
  departmentId: number | null;
  supervisorId: number | null;
  isActive: boolean;
  mustResetPw: boolean;
}

interface MockDepartment {
  id: number;
  code: string;
  name: string;
  collegeId: number | null;
  isActive: boolean;
}

const colleges = [
  { id: 1, name: "College of Engineering", code: "COE" },
  { id: 2, name: "College of Arts & Sciences", code: "CAS" },
];

// Mirrors the real `prisma db seed`: every registrar code becomes a
// department row, with only a couple pre-assigned to a college so the demo
// shows what "unassigned, needs an admin to fill it in" looks like too.
const departments: MockDepartment[] = INITIAL_DEPARTMENT_CODES.map((code, index) => {
  const id = index + 1;
  if (code === "CSC") return { id, code, name: "Computer Science", collegeId: 1, isActive: true };
  if (code === "MATH") return { id, code, name: "Mathematics", collegeId: 2, isActive: true };
  return { id, code, name: code, collegeId: null, isActive: true };
});
let nextDepartmentId = departments.length + 1;
const cscDepartmentId = departments.find((d) => d.code === "CSC")!.id;

function departmentOf(id: number | null) {
  const d = departments.find((d) => d.id === id);
  if (!d) return null;
  const c = d.collegeId ? colleges.find((c) => c.id === d.collegeId) ?? null : null;
  return { id: d.id, name: d.name, college: c ? { id: c.id, name: c.name } : null };
}

const users: MockUser[] = [
  {
    id: 1,
    email: "admin@tntech.edu",
    password: "ChangeMe!Admin1",
    firstName: "Ada",
    lastName: "Admin",
    role: "ADMIN",
    payType: "MONTHLY",
    departmentId: cscDepartmentId,
    supervisorId: null,
    isActive: true,
    mustResetPw: false,
  },
  {
    id: 2,
    email: "supervisor@tntech.edu",
    password: "ChangeMe!Super1",
    firstName: "Sam",
    lastName: "Supervisor",
    role: "SUPERVISOR",
    payType: "MONTHLY",
    departmentId: cscDepartmentId,
    supervisorId: null,
    isActive: true,
    mustResetPw: false,
  },
  {
    id: 3,
    email: "student@tntech.edu",
    password: "ChangeMe!Student1",
    firstName: "Stu",
    lastName: "Student",
    role: "STUDENT",
    payType: "BIWEEKLY",
    departmentId: cscDepartmentId,
    supervisorId: 2,
    isActive: true,
    mustResetPw: false,
  },
];
let nextUserId = 4;

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface MockTimeEntry {
  id: number;
  userId: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

const timeEntries: MockTimeEntry[] = [
  {
    id: 1,
    userId: 3,
    clockIn: new Date(now - 6 * DAY + 9 * HOUR).toISOString(),
    clockOut: new Date(now - 6 * DAY + 13 * HOUR).toISOString(),
    status: "APPROVED",
  },
  {
    id: 2,
    userId: 3,
    clockIn: new Date(now - 4 * DAY + 9 * HOUR).toISOString(),
    clockOut: new Date(now - 4 * DAY + 17 * HOUR).toISOString(),
    status: "APPROVED",
  },
  {
    id: 3,
    userId: 3,
    clockIn: new Date(now - 1 * DAY + 9 * HOUR).toISOString(),
    clockOut: new Date(now - 1 * DAY + 14 * HOUR).toISOString(),
    status: "PENDING",
  },
];
let nextEntryId = 4;

interface MockPayPeriod {
  id: number;
  type: PayType;
  startDate: string;
  endDate: string;
  payDate: string;
  status: "OPEN" | "PROCESSING" | "CLOSED";
}

const payPeriods: MockPayPeriod[] = [
  {
    id: 1,
    type: "BIWEEKLY",
    startDate: new Date(now - 20 * DAY).toISOString(),
    endDate: new Date(now - 6 * DAY).toISOString(),
    payDate: new Date(now - 3 * DAY).toISOString(),
    status: "CLOSED",
  },
  {
    id: 2,
    type: "MONTHLY",
    startDate: new Date(now - 30 * DAY).toISOString(),
    endDate: new Date(now).toISOString(),
    payDate: new Date(now + 2 * DAY).toISOString(),
    status: "OPEN",
  },
];
let nextPeriodId = 3;

interface MockPayStub {
  id: number;
  userId: number;
  payPeriodId: number;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
}

const payStubs: MockPayStub[] = [
  { id: 1, userId: 3, payPeriodId: 1, regularHours: "32.00", overtimeHours: "0.00", grossPay: "368.00", status: "FINALIZED" },
  { id: 2, userId: 1, payPeriodId: 2, regularHours: "0.00", overtimeHours: "0.00", grossPay: "5416.67", status: "DRAFT" },
  { id: 3, userId: 2, payPeriodId: 2, regularHours: "0.00", overtimeHours: "0.00", grossPay: "4833.33", status: "DRAFT" },
];
let nextStubId = 4;

let currentUserId: number | null = null;

function me(): MockUser {
  const u = users.find((u) => u.id === currentUserId);
  if (!u) throw new ApiError(401, "Not authenticated.");
  return u;
}

function publicUser(u: MockUser) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    payType: u.payType,
    mustResetPw: u.mustResetPw,
    department: departmentOf(u.departmentId),
  };
}

function withPayPeriod(stub: MockPayStub) {
  const period = payPeriods.find((p) => p.id === stub.payPeriodId)!;
  return { ...stub, payPeriod: period };
}

async function delay() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

export async function mockRequest<T>(path: string, options: RequestInit): Promise<T> {
  await delay();
  const method = (options.method ?? "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : undefined;

  // --- auth ---
  if (path === "/auth/login" && method === "POST") {
    const user = users.find((u) => u.email === body.email);
    if (!user || !user.isActive || user.password !== body.password) {
      throw new ApiError(401, "Invalid email or password.");
    }
    currentUserId = user.id;
    return { accessToken: "mock-token", user: publicUser(user) } as T;
  }
  if (path === "/auth/refresh" && method === "POST") {
    // No persisted session in mock mode - always require a fresh login.
    throw new ApiError(401, "No session.");
  }
  if (path === "/auth/logout" && method === "POST") {
    currentUserId = null;
    return undefined as T;
  }
  if (path === "/auth/me" && method === "GET") {
    return publicUser(me()) as T;
  }

  // --- timeclock ---
  if (path === "/timeclock/clock-in" && method === "POST") {
    const user = me();
    if (timeEntries.some((e) => e.userId === user.id && e.clockOut === null)) {
      throw new ApiError(409, "Already clocked in.");
    }
    const entry: MockTimeEntry = { id: nextEntryId++, userId: user.id, clockIn: new Date().toISOString(), clockOut: null, status: "PENDING" };
    timeEntries.push(entry);
    return entry as T;
  }
  if (path === "/timeclock/clock-out" && method === "POST") {
    const user = me();
    const entry = timeEntries.find((e) => e.userId === user.id && e.clockOut === null);
    if (!entry) throw new ApiError(409, "Not currently clocked in.");
    entry.clockOut = new Date().toISOString();
    return entry as T;
  }
  if (path === "/timeclock/my-entries" && method === "GET") {
    const user = me();
    return timeEntries
      .filter((e) => e.userId === user.id)
      .sort((a, b) => b.clockIn.localeCompare(a.clockIn)) as T;
  }
  if (path === "/timeclock/pending" && method === "GET") {
    const user = me();
    const relevant = timeEntries.filter((e) => {
      if (e.status !== "PENDING") return false;
      const owner = users.find((u) => u.id === e.userId)!;
      return user.role === "ADMIN" || owner.supervisorId === user.id;
    });
    return relevant.map((e) => {
      const owner = users.find((u) => u.id === e.userId)!;
      return { ...e, user: { id: owner.id, firstName: owner.firstName, lastName: owner.lastName } };
    }) as T;
  }
  const decisionMatch = path.match(/^\/timeclock\/(\d+)\/decision$/);
  if (decisionMatch && method === "PATCH") {
    const entry = timeEntries.find((e) => e.id === Number(decisionMatch[1]));
    if (!entry) throw new ApiError(404, "Time entry not found.");
    entry.status = body.status;
    return entry as T;
  }

  // --- payroll ---
  if (path === "/payroll/periods" && method === "GET") {
    return [...payPeriods].sort((a, b) => b.startDate.localeCompare(a.startDate)) as T;
  }
  if (path === "/payroll/periods" && method === "POST") {
    const period: MockPayPeriod = { id: nextPeriodId++, status: "OPEN", ...body };
    payPeriods.push(period);
    return period as T;
  }
  const generateMatch = path.match(/^\/payroll\/periods\/(\d+)\/generate$/);
  if (generateMatch && method === "POST") {
    const period = payPeriods.find((p) => p.id === Number(generateMatch[1]));
    if (!period) throw new ApiError(404, "Pay period not found.");
    period.status = "PROCESSING";
    const eligible = users.filter((u) => u.payType === period.type && u.isActive);
    for (const u of eligible) {
      if (!payStubs.some((s) => s.userId === u.id && s.payPeriodId === period.id)) {
        payStubs.push({ id: nextStubId++, userId: u.id, payPeriodId: period.id, regularHours: "0.00", overtimeHours: "0.00", grossPay: "0.00", status: "DRAFT" });
      }
    }
    return { generated: eligible.length } as T;
  }
  const finalizeMatch = path.match(/^\/payroll\/periods\/(\d+)\/finalize$/);
  if (finalizeMatch && method === "POST") {
    const period = payPeriods.find((p) => p.id === Number(finalizeMatch[1]));
    if (!period) throw new ApiError(404, "Pay period not found.");
    period.status = "CLOSED";
    payStubs.filter((s) => s.payPeriodId === period.id).forEach((s) => (s.status = "FINALIZED"));
    return period as T;
  }
  if (path === "/payroll/my-stubs" && method === "GET") {
    const user = me();
    return payStubs.filter((s) => s.userId === user.id).map(withPayPeriod) as T;
  }

  // --- reports ---
  if (path.startsWith("/reports/payroll") && method === "GET") {
    const user = me();
    const params = new URLSearchParams(path.split("?")[1]);
    const payPeriodId = Number(params.get("payPeriodId"));
    const scope = user.role === "SUPERVISOR" ? "DEPARTMENT" : params.get("scope") ?? "ALL";
    const scopeId = user.role === "SUPERVISOR" ? user.departmentId : params.get("scopeId") ? Number(params.get("scopeId")) : undefined;

    const rows = payStubs
      .filter((s) => s.payPeriodId === payPeriodId)
      .map((s) => ({ stub: s, owner: users.find((u) => u.id === s.userId)! }))
      .filter(({ owner }) => {
        if (scope === "ALL") return true;
        if (scope === "DEPARTMENT") return owner.departmentId === scopeId;
        if (scope === "COLLEGE") return departments.find((d) => d.id === owner.departmentId)?.collegeId === scopeId;
        return true;
      })
      .map(({ stub, owner }) => {
        const dept = departmentOf(owner.departmentId);
        return `${owner.id},${owner.firstName},${owner.lastName},${owner.role},${owner.payType},${dept?.name ?? ""},${dept?.college?.name ?? ""},${stub.regularHours},${stub.overtimeHours},${stub.grossPay},${stub.status}`;
      });

    const header = "employeeId,firstName,lastName,role,payType,department,college,regularHours,overtimeHours,grossPay,status";
    const csv = [header, ...rows].join("\n");
    return new Blob([csv], { type: "text/csv" }) as unknown as T;
  }

  // --- users ---
  if (path === "/users" && method === "GET") {
    const user = me();
    const visible = user.role === "ADMIN" ? users : users.filter((u) => u.supervisorId === user.id);
    return visible.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      payType: u.payType,
      isActive: u.isActive,
      department: departmentOf(u.departmentId),
    })) as T;
  }
  if (path === "/users" && method === "POST") {
    const newUser: MockUser = {
      id: nextUserId++,
      email: body.email,
      password: "temp-password",
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      payType: body.payType,
      departmentId: body.departmentId ?? null,
      supervisorId: body.supervisorId ?? null,
      isActive: true,
      mustResetPw: true,
    };
    users.push(newUser);
    return { id: newUser.id, email: newUser.email, tempPassword: "Demo-Temp-Pass123" } as T;
  }
  const deactivateMatch = path.match(/^\/users\/(\d+)\/deactivate$/);
  if (deactivateMatch && method === "PATCH") {
    const u = users.find((u) => u.id === Number(deactivateMatch[1]));
    if (!u) throw new ApiError(404, "User not found.");
    u.isActive = false;
    return undefined as T;
  }

  // --- org ---
  if (path === "/org/colleges" && method === "GET") {
    return colleges.map((c) => ({
      ...c,
      departments: departments.filter((d) => d.collegeId === c.id).map((d) => ({ id: d.id, name: d.name, code: d.code, isActive: d.isActive })),
    })) as T;
  }
  if (path === "/org/colleges" && method === "POST") {
    const nextId = Math.max(0, ...colleges.map((c) => c.id)) + 1;
    const college = { id: nextId, name: body.name, code: body.code };
    colleges.push(college);
    return college as T;
  }
  if (path === "/org/departments" && method === "GET") {
    return [...departments]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        isActive: d.isActive,
        college: d.collegeId ? colleges.find((c) => c.id === d.collegeId) ?? null : null,
      })) as T;
  }
  if (path === "/org/departments" && method === "POST") {
    const dept: MockDepartment = {
      id: nextDepartmentId++,
      code: body.code,
      name: body.name,
      collegeId: body.collegeId ?? null,
      isActive: true,
    };
    departments.push(dept);
    return dept as T;
  }
  const departmentUpdateMatch = path.match(/^\/org\/departments\/(\d+)$/);
  if (departmentUpdateMatch && method === "PATCH") {
    const dept = departments.find((d) => d.id === Number(departmentUpdateMatch[1]));
    if (!dept) throw new ApiError(404, "Department not found.");
    if (body.code !== undefined) dept.code = body.code;
    if (body.name !== undefined) dept.name = body.name;
    if (body.collegeId !== undefined) dept.collegeId = body.collegeId;
    if (body.isActive !== undefined) dept.isActive = body.isActive;
    return dept as T;
  }

  throw new ApiError(404, `Mock API: no handler for ${method} ${path}`);
}
