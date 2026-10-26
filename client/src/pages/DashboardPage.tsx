import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ClockWidget } from "../components/ClockWidget";
import { TimesheetTable } from "../components/TimesheetTable";
import { ApprovalQueue } from "../components/ApprovalQueue";
import { PayPeriodManager } from "../components/PayPeriodManager";
import { UserManagement } from "../components/UserManagement";
import { DepartmentManagement } from "../components/DepartmentManagement";
import { ChargeAccountManagement } from "../components/ChargeAccountManagement";
import { PayStubList } from "../components/PayStubList";
import { SupervisorOrganizer } from "../components/SupervisorOrganizer";
import { SupervisorTools } from "../components/SupervisorTools";
import { AdminLaunchpad } from "../components/AdminLaunchpad";
import { ProfilePhotoButton } from "../components/ProfilePhotoButton";
import { StudentTimeTools } from "../components/StudentTimeTools";
import { PayRateManager } from "../components/PayRateManager";
import { TeamPayStubStatus } from "../components/TeamPayStubStatus";
import { StudentTimecards } from "../components/StudentTimecards";
import { ReminderSender } from "../components/ReminderSender";
import { WorkQueue, type TodoItem } from "../components/WorkQueue";
import type { AdminToolKey } from "../components/AdminLaunchpad";
import { api } from "../api/client";

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

  async function loadEntries() {
    const data = await api.get<TimeEntry[]>("/timeclock/my-entries");
    setEntries(data);
  }

  useEffect(() => {
    loadEntries();
  }, []);

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

  function openStudentTodo(item: TodoItem) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const selector = item.target === "time" ? ".student-time-tools" : ".talon-current-timecard";
    const target = document.querySelector(selector) as HTMLElement | null;
    target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    target?.querySelector<HTMLElement>("h2, button, select, input, textarea")?.focus({ preventScroll: true });
  }

  return (
    <main id="main-content" className={`dashboard dashboard--${user.role.toLowerCase()}`} data-admin-view={user.role === "ADMIN" && adminSection ? adminSection : undefined}>
      <h1 className="dashboard__title"><ProfilePhotoButton userId={user.id} onStatus={setPhotoStatus} /><span>{greeting}, {user.preferredName || user.firstName}</span></h1>
      {photoStatus && <p className="dashboard__photo-message" role="status">{photoStatus}</p>}

      {user.role === "SUPERVISOR" && <>
        <SupervisorOrganizer />
        <SupervisorTools clocksIn={clocksIn} entries={entries} onEntriesChanged={loadEntries} />
      </>}
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

      {(user.role === "STUDENT" || (user.role === "ADMIN" && adminSection)) && <div className="dashboard-grid">
        {clocksIn && user.role === "STUDENT" && (
          <>
            <ClockWidget onChange={loadEntries} />
            {user.role === "STUDENT" && <WorkQueue title="To-Dos" className="card student-todos" onOpen={openStudentTodo} hideWhenEmpty />}
            {user.role === "STUDENT" && <StudentTimeTools entries={entries} onSubmitted={loadEntries} />}
            <TimesheetTable entries={entries} caption="My recent time entries" />
            {user.role === "STUDENT" && <StudentTimecards entries={entries} />}
          </>
        )}

        {user.role === "STUDENT" && <PayStubList />}
        {adminSection === "approvals" && <ApprovalQueue />}
        {adminSection === "approvals" && <TeamPayStubStatus />}
        {adminSection === "approvals" && <PayRateManager />}
        {adminSection === "approvals" && <ReminderSender />}

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
