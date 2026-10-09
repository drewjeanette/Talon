import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ClockWidget } from "../components/ClockWidget";
import { TimesheetTable } from "../components/TimesheetTable";
import { ApprovalQueue } from "../components/ApprovalQueue";
import { PayrollReport } from "../components/PayrollReport";
import { PayPeriodManager } from "../components/PayPeriodManager";
import { UserManagement } from "../components/UserManagement";
import { DepartmentManagement } from "../components/DepartmentManagement";
import { ChargeAccountManagement } from "../components/ChargeAccountManagement";
import { PayStubList } from "../components/PayStubList";
import { SupervisorOrganizer } from "../components/SupervisorOrganizer";
import { AdminLaunchpad } from "../components/AdminLaunchpad";
import { ProfilePhotoButton } from "../components/ProfilePhotoButton";
import { StudentTimeTools, approverList } from "../components/StudentTimeTools";
import { PayRateManager } from "../components/PayRateManager";
import { TeamPayStubStatus } from "../components/TeamPayStubStatus";
import { StudentTimecards } from "../components/StudentTimecards";
import { ReminderSender } from "../components/ReminderSender";
import { WorkQueue } from "../components/WorkQueue";
import type { AdminToolKey } from "../components/AdminLaunchpad";
import { api } from "../api/client";
import { goToTodo } from "../lib/goTo";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy?: string | null;
  rejectionReason?: string | null;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [adminSection, setAdminSection] = useState<AdminToolKey | null>(null);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<string[]>([]);

  async function loadEntries() {
    const data = await api.get<TimeEntry[]>("/timeclock/my-entries");
    setEntries(data);
  }

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    if (user?.role !== "STUDENT") return;
    api.get<{ supervisors: string[] }>("/users/me/approvers").then((data) => setApprovers(data.supervisors)).catch(() => setApprovers([]));
  }, [user?.role]);

  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!user) return null;
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  // Students clock in whether they are paid bi-weekly or monthly.
  const clocksIn = user.role === "STUDENT" || user.payType === "BIWEEKLY";
  const sectionTitles: Record<AdminToolKey, string> = {
    approvals: "Time Entry Approvals",
    payroll: "Generate Payroll and Pay Periods",
    users: "User Management",
    departments: "Departments & Colleges",
    paystubs: "My Pay Stubs",
  };

  function selectAdminSection(section: AdminToolKey | null) {
    setAdminSection(section);
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelector(section ? ".admin-section-bar" : ".admin-launchpad")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    });
  }

  return (
    <main id="main-content" className={`dashboard dashboard--${user.role.toLowerCase()}`} data-admin-view={user.role === "ADMIN" && adminSection ? adminSection : undefined}>
      <h1 className="dashboard__title"><ProfilePhotoButton userId={user.id} onStatus={setPhotoStatus} /><span>{greeting}, {user.preferredName || user.firstName}</span></h1>
      {photoStatus && <p className="dashboard__photo-message" role="status">{photoStatus}</p>}

      {user.role === "SUPERVISOR" && <SupervisorOrganizer />}
      {user.role === "STUDENT" && <WorkQueue title="To-Dos" className="card student-todos" onOpen={goToTodo} hideWhenEmpty />}
      {user.role === "ADMIN" && (
        <>
          <AdminLaunchpad selected={adminSection} onSelect={selectAdminSection} />
          {adminSection && (
            <div className="admin-section-bar">
              <h2 className="admin-section-bar__title">{sectionTitles[adminSection]}</h2>
              <button type="button" className="admin-section-bar__back" onClick={() => selectAdminSection(null)}>Back to Overview</button>
            </div>
          )}
        </>
      )}

      {(user.role !== "ADMIN" || adminSection) && <div className="dashboard-grid">
        {clocksIn && user.role !== "ADMIN" && (
          <>
            <ClockWidget onChange={loadEntries} />
            {user.role === "STUDENT" && <StudentTimeTools entries={entries} onSubmitted={loadEntries} />}
            <TimesheetTable entries={entries} caption="My recent time entries" />
            {user.role === "STUDENT" && <StudentTimecards entries={entries} waitingOn={approverList(approvers)} />}
          </>
        )}

        {user.role === "STUDENT" && <PayStubList />}
        {(user.role === "SUPERVISOR" || adminSection === "approvals") && <ApprovalQueue />}
        {(user.role === "SUPERVISOR" || adminSection === "approvals") && <TeamPayStubStatus />}
        {(user.role === "SUPERVISOR" || adminSection === "approvals") && <PayRateManager />}
        {adminSection === "approvals" && <ReminderSender />}
        {user.role === "SUPERVISOR" && <PayrollReport />}
        {user.role === "SUPERVISOR" && <PayStubList />}

        {adminSection === "payroll" && <PayPeriodManager />}
        {adminSection === "users" && <UserManagement />}
        {adminSection === "departments" && <DepartmentManagement />}
        {adminSection === "departments" && <ChargeAccountManagement />}
        {adminSection === "paystubs" && <PayStubList />}
      </div>
      }
    </main>
  );
}
