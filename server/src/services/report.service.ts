import { stringify } from "csv-stringify/sync";
import { prisma } from "../config/prisma.js";
import type { ReportScope } from "@prisma/client";

interface PayrollReportFilter {
  scope: ReportScope;
  scopeId?: number;
  payPeriodId?: number;
}

export async function buildPayrollReportRows(filter: PayrollReportFilter) {
  const departmentFilter =
    filter.scope === "DEPARTMENT" && filter.scopeId ? { departmentId: filter.scopeId } : {};
  const collegeFilter =
    filter.scope === "COLLEGE" && filter.scopeId ? { department: { collegeId: filter.scopeId } } : {};

  const stubs = await prisma.payStub.findMany({
    where: {
      payPeriodId: filter.payPeriodId,
      user: { ...departmentFilter, ...collegeFilter },
    },
    include: {
      user: { include: { department: { include: { college: true } } } },
      payPeriod: true,
    },
    orderBy: [{ user: { lastName: "asc" } }],
  });

  return stubs.map((stub) => ({
    employeeId: stub.userId,
    firstName: stub.user.firstName,
    lastName: stub.user.lastName,
    role: stub.user.role,
    payType: stub.user.payType,
    department: stub.user.department?.name ?? "",
    college: stub.user.department?.college?.name ?? "",
    payPeriodStart: stub.payPeriod.startDate.toISOString().slice(0, 10),
    payPeriodEnd: stub.payPeriod.endDate.toISOString().slice(0, 10),
    regularHours: stub.regularHours.toString(),
    overtimeHours: stub.overtimeHours.toString(),
    grossPay: stub.grossPay.toString(),
    status: stub.status,
  }));
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  return stringify(rows, { header: true });
}
