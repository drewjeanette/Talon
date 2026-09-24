import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ClockWidget } from "../components/ClockWidget";
import { TimesheetTable } from "../components/TimesheetTable";
import { ApprovalQueue } from "../components/ApprovalQueue";
import { ReportGenerator } from "../components/ReportGenerator";
import { PayPeriodManager } from "../components/PayPeriodManager";
import { UserManagement } from "../components/UserManagement";
import { DepartmentManagement } from "../components/DepartmentManagement";
import { PayStubList } from "../components/PayStubList";
import { SupervisorOrganizer } from "../components/SupervisorOrganizer";
import { AdminLaunchpad } from "../components/AdminLaunchpad";
import { ProfilePhotoButton } from "../components/ProfilePhotoButton";
import { NotificationInbox } from "../components/NotificationInbox";
import { StudentTimeTools } from "../components/StudentTimeTools";
import { SupervisorPayRateManager } from "../components/SupervisorPayRateManager";
import { TeamPayStubStatus } from "../components/TeamPayStubStatus";
import { StudentTimecards } from "../components/StudentTimecards";
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
  const [reportSender, setReportSender] = useState<string | null>(null);

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

  function selectAdminSection(section: AdminToolKey | null) {
    setAdminSection(section);
    window.requestAnimationFrame(() => {
      document.querySelector(section ? ".admin-section-bar" : ".admin-launchpad")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // The class hooks here (dashboard, dashboard-grid) let each role's designer
  // rearrange the cards with CSS alone, since design files cannot change markup.
  return (
    <main id="main-content" className={`dashboard dashboard--${user.role.toLowerCase()}`} data-admin-view={user.role === "ADMIN" && adminSection ? adminSection : undefined}>
      <h1 className="dashboard__title"><ProfilePhotoButton userId={user.id} onStatus={setPhotoStatus} /><span>{greeting}, {user.firstName}</span></h1>
      {photoStatus && <p className="dashboard__photo-message" role="status">{photoStatus}</p>}

      {user.role === "SUPERVISOR" && <NotificationInbox onReportSender={setReportSender} />}
      {user.role === "SUPERVISOR" && <SupervisorOrganizer reportSender={reportSender} />}
      {user.role === "ADMIN" && (
        <>
          <AdminLaunchpad selected={adminSection} onSelect={selectAdminSection} />
          {adminSection && (
            <div className="admin-section-bar">
              <h2 className="admin-section-bar__title">{adminSection === "approvals" ? "Time Entry Approvals" : adminSection === "payroll" ? "Payroll & Pay Periods" : adminSection === "reports" ? "Payroll Reports" : adminSection === "users" ? "User Management" : adminSection === "departments" ? "Departments & Colleges" : "My Pay Stubs"}</h2>
              <button type="button" className="admin-section-bar__back" onClick={() => selectAdminSection(null)}>Back to Overview</button>
            </div>
          )}
        </>
      )}

      {(user.role !== "ADMIN" || adminSection) && <div className="dashboard-grid">
        {user.payType === "BIWEEKLY" && (
          <>
            <ClockWidget onChange={loadEntries} />
            {user.role === "STUDENT" && <StudentTimeTools entries={entries} onSubmitted={loadEntries} />}
            <TimesheetTable entries={entries} caption="My recent time entries" />
            {user.role === "STUDENT" && <StudentTimecards entries={entries} />}
          </>
        )}

        {(user.role === "SUPERVISOR" || adminSection === "reports") && <ReportGenerator />}
        {(user.role !== "ADMIN" || adminSection === "stubs") && <PayStubList />}
        {user.role === "SUPERVISOR" && <TeamPayStubStatus />}
        {adminSection === "approvals" && <TeamPayStubStatus />}
        {user.role === "SUPERVISOR" && <SupervisorPayRateManager />}
        {(user.role === "SUPERVISOR" || adminSection === "approvals") && <ApprovalQueue />}

        {adminSection === "payroll" && <PayPeriodManager />}
        {adminSection === "users" && <UserManagement />}
        {adminSection === "departments" && <DepartmentManagement />}
      </div>
      }
    </main>
  );
}
