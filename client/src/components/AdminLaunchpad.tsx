import { goToTodo } from "../lib/goTo";
import { RoleCalendar } from "./RoleCalendar";
import { WorkQueue } from "./WorkQueue";

const ICONS = {
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  payroll: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h10M7 13h4M15 13h2" /></svg>,
  users: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 6" /></svg>,
  building: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V7l8-4 8 4v14M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3" /></svg>,
  stub: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6M9 19h3" /></svg>,
};

const TOOLS = [
  { key: "approvals", icon: "check", title: "Time Entry Approvals", description: "Approve time and corrections, review student pay stubs, and set hourly rates." },
  { key: "payroll", icon: "payroll", title: "Generate Payroll and Pay Periods", description: "Create, generate, and finalize periods. Compare people in the payroll report." },
  { key: "users", icon: "users", title: "User Management", description: "Create users, assign supervisors, roles, and charge accounts." },
  { key: "departments", icon: "building", title: "Departments & Colleges", description: "Maintain departments, colleges, and charge accounts." },
  { key: "paystubs", icon: "stub", title: "My Pay Stubs", description: "View or download your own pay stubs." },
] as const;

export type AdminToolKey = (typeof TOOLS)[number]["key"];

export function AdminLaunchpad({ selected, onSelect }: { selected: AdminToolKey | null; onSelect: (key: AdminToolKey) => void }) {
  return (
    <section className="admin-launchpad" aria-label="Admin dashboard tools">
      <aside className="admin-work-panel">
        <WorkQueue
          title="Work to Do"
          className="work-queue--admin"
          onOpen={(item) => {
            onSelect(item.target === "approvals" ? "approvals" : "payroll");
            goToTodo(item);
          }}
        />
        <RoleCalendar role="admin" />
      </aside>
      <div className="admin-tools-panel">
        <h2 className="admin-panel-title">Admin Tools</h2>
        <div className="admin-tile-grid">
          {TOOLS.map((tool) => (
            <button key={tool.key} type="button" className="admin-tile" aria-pressed={selected === tool.key} onClick={() => onSelect(tool.key)}>
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
