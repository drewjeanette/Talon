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
  const [completed, setCompleted] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string[]>([]);

  function complete(key: string) {
    setRemoving((items) => [...items, key]);
    window.setTimeout(() => {
      setCompleted((items) => [...items, key]);
      setRemoving((items) => items.filter((item) => item !== key));
    }, 220);
  }

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
      <aside className={`admin-work-panel${completed.length === 2 ? " admin-work-panel--complete" : ""}`}>
        <h2 className="admin-panel-title">Work to Do</h2>
        <div className="admin-work-list">
          {completed.length === 2 ? <div role="status"><span className="admin-success" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M14 33l12 12 25-28" /></svg></span><p className="admin-work-empty">All Clear For Now! No Pending Tasks.</p></div> : <>
            {!completed.includes("approvals") && <div className={`admin-work-task${removing.includes("approvals") ? " admin-work-task--removing" : ""}`}>
              <button type="button" className="admin-work-item" onClick={() => onSelect("approvals")}><span>Pending approvals</span><strong className="admin-work-count">{pending}</strong></button>
              <div className="admin-work-detail"><p>Open the approval queue to review submitted time and student pay stubs.</p><label className="admin-work-complete"><input type="checkbox" onChange={() => complete("approvals")} /> Mark task complete</label></div>
            </div>}
            {!completed.includes("payroll") && <div className={`admin-work-task${removing.includes("payroll") ? " admin-work-task--removing" : ""}`}>
              <button type="button" className="admin-work-item" onClick={() => onSelect("payroll")}><span>Open pay periods</span><strong className="admin-work-count">{openPeriods}</strong></button>
              <div className="admin-work-detail"><p>Open Payroll &amp; Pay Periods to manage the periods that still need work.</p><label className="admin-work-complete"><input type="checkbox" onChange={() => complete("payroll")} /> Mark task complete</label></div>
            </div>}
          </>}
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
