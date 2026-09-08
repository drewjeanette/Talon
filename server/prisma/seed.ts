import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { INITIAL_DEPARTMENT_CODES } from "./departmentCodes.js";

const prisma = new PrismaClient();

async function main() {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  const college = await prisma.college.upsert({
    where: { code: "COE" },
    update: {},
    create: { name: "College of Engineering", code: "COE" },
  });

  const department = await prisma.department.upsert({
    where: { code: "CSC" },
    update: {},
    create: { name: "Computer Science", code: "CSC", collegeId: college.id },
  });

  // Seed the full registrar department-code list as placeholder rows (name =
  // code, no college assigned yet) so an admin can rename/assign/deactivate
  // them from the UI instead of a developer hardcoding a list in source.
  // Skips CSC since it already exists above with a real name and college.
  for (const code of INITIAL_DEPARTMENT_CODES) {
    if (code === "CSC") continue;
    await prisma.department.upsert({
      where: { code },
      update: {},
      create: { name: code, code },
    });
  }

  const adminPassword = await bcrypt.hash("ChangeMe!Admin1", saltRounds);
  const admin = await prisma.user.upsert({
    where: { email: "admin@tntech.edu" },
    update: {},
    create: {
      email: "admin@tntech.edu",
      passwordHash: adminPassword,
      firstName: "Ada",
      lastName: "Admin",
      role: "ADMIN",
      payType: "MONTHLY",
      annualSalary: 65000,
      departmentId: department.id,
      mustResetPw: false,
    },
  });

  const supervisorPassword = await bcrypt.hash("ChangeMe!Super1", saltRounds);
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@tntech.edu" },
    update: {},
    create: {
      email: "supervisor@tntech.edu",
      passwordHash: supervisorPassword,
      firstName: "Sam",
      lastName: "Supervisor",
      role: "SUPERVISOR",
      payType: "MONTHLY",
      annualSalary: 58000,
      departmentId: department.id,
      mustResetPw: false,
    },
  });

  const studentPassword = await bcrypt.hash("ChangeMe!Student1", saltRounds);
  await prisma.user.upsert({
    where: { email: "student@tntech.edu" },
    update: {},
    create: {
      email: "student@tntech.edu",
      passwordHash: studentPassword,
      firstName: "Stu",
      lastName: "Student",
      role: "STUDENT",
      payType: "BIWEEKLY",
      hourlyRate: 11.5,
      departmentId: department.id,
      supervisorId: supervisor.id,
      mustResetPw: false,
    },
  });

  console.log("Seed complete. Admin user id:", admin.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
