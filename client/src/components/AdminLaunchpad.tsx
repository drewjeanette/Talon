import { useEffect, useState } from "react";
import { api } from "../api/client";
import { RoleCalendar } from "./RoleCalendar";

const ICONS = {
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  payroll: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h10M7 13h4M15 13h2" /></svg>,
  report: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM9 13h6M9 17h6M14 3v4h4" /></svg>,
  users: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 6" /></svg>,
  building: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V7l8-4 8 4v14M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3" /></svg>,
  stub: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18l-2-1.5L15 21l-2-1.5L11 21l-2-1.5L5 21zM8 8h8M8 12h8M8 16h5" /></svg>,
};

const TOOLS = [
  { key: "approvals", icon: "check", title: "Time Entry Approvals", description: "Review and approve submitted employee time." },
  { key: "payroll", icon: "payroll", title: "Payroll & Pay Periods", description: "Create, generate, and finalize pay periods." },
  { key: "reports", icon: "report", title: "Payroll Reports", description: "Generate downloadable payroll reports." },
  { key: "users", icon: "users", title: "User Management", description: "Create users, assign roles, and manage access." },
  { key: "departments", icon: "building", title: "Departments & Colleges", description: "Maintain departments, codes, and colleges." },
  { key: "stubs", icon: "stub", title: "My Pay Stubs", description: "View personal pay history and pay-stub status." },
] as const;

export type AdminToolKey = (typeof TOOLS)[number]["key"];

interface PendingEntry { id: number }
interface PayPeriod { id: number; status: "OPEN" | "PROCESSING" | "CLOSED" }

export function AdminLaunchpad({ selected, onSelect }: { selected: AdminToolKey | null; onSelect: (key: AdminToolKey) => void }) {
  const [pending, setPending] = useState(0);
  const [openPeriods, setOpenPeriods] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<PendingEntry[]>("/timeclock/pending"),
      api.get<PayPeriod[]>("/payroll/periods"),
    ]).then(([entries, periods]) => {
      if (!active) return;
      setPending(entries.length);
      setOpenPeriods(periods.filter((period) => period.status !== "CLOSED").length);
    }).catch(() => {
      // Keep the overview available if a count cannot be fetched.
    });
    return () => { active = false; };
  }, [selected]);

  return (
    <section className="admin-launchpad" aria-label="Admin dashboard tools">
      <aside className="admin-work-panel">
        <h2 className="admin-panel-title">Work to Do</h2>
        <div className="admin-work-list">
          <div className="admin-work-item"><span>Pending approvals</span><strong className="admin-work-count">{pending}</strong></div>
          <div className="admin-work-item"><span>Open pay periods</span><strong className="admin-work-count">{openPeriods}</strong></div>
        </div>
        <RoleCalendar role="admin" />
      </aside>
      <div className="admin-tools-panel">
        <h2 className="admin-panel-title">Admin Tools</h2>
        <div className="admin-tile-grid">
          {TOOLS.map((tool) => (
            <button key={tool.key} type="button" className="admin-tile" aria-selected={selected === tool.key} onClick={() => onSelect(tool.key)}>
              <span className="admin-tile__icon">{ICONS[tool.icon]}</span>
              <span className="admin-tile__title">{tool.title}</span>
              <span className="admin-tile__description">{tool.description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
