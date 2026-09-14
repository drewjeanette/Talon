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
import { api } from "../api/client";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export function DashboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  async function loadEntries() {
    const data = await api.get<TimeEntry[]>("/timeclock/my-entries");
    setEntries(data);
  }

  useEffect(() => {
    loadEntries();
  }, []);

  if (!user) return null;

  // The class hooks here (dashboard, dashboard-grid) let each role's designer
  // rearrange the cards with CSS alone, since design files cannot change markup.
  return (
    <main id="main-content" className={`dashboard dashboard--${user.role.toLowerCase()}`}>
      <h1 className="dashboard__title">Welcome, {user.firstName}</h1>

      <div className="dashboard-grid">
        {user.payType === "BIWEEKLY" && (
          <>
            <ClockWidget onChange={loadEntries} />
            <TimesheetTable entries={entries} caption="My recent time entries" />
          </>
        )}

        <PayStubList />

        {(user.role === "SUPERVISOR" || user.role === "ADMIN") && (
          <>
            <ApprovalQueue />
            <ReportGenerator />
          </>
        )}

        {user.role === "ADMIN" && (
          <>
            <PayPeriodManager />
            <UserManagement />
            <DepartmentManagement />
          </>
        )}
      </div>
    </main>
  );
}
