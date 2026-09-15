import { RoleCalendar } from "./RoleCalendar";

const TOOLS = [
  { label: "Time approvals", description: "Review pending entries", target: ".approval-queue", icon: "✓" },
  { label: "Payroll reports", description: "Create and review reports", target: ".report-generator", icon: "▤" },
  { label: "Pay periods", description: "Manage payroll dates", target: ".pay-period-manager", icon: "▦" },
  { label: "Users", description: "Manage accounts", target: ".user-management", icon: "♙" },
  { label: "Departments", description: "Manage departments", target: ".department-management", icon: "▣" },
  { label: "My pay stubs", description: "View pay history", target: ".pay-stubs", icon: "$" },
];

export function AdminLaunchpad() {
  function open(target: string) {
    document.querySelector<HTMLElement>(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="admin-launchpad">
      <section className="admin-work-panel" aria-label="Admin calendar">
        <h2 className="admin-panel-title">Calendar</h2>
        <RoleCalendar role="admin" />
      </section>
      <section className="admin-tools-panel" aria-labelledby="admin-tools-heading">
        <h2 id="admin-tools-heading" className="admin-panel-title">Quick access</h2>
        <div className="admin-tile-grid">
          {TOOLS.map((tool) => (
            <button key={tool.target} type="button" className="admin-tile" onClick={() => open(tool.target)}>
              <span className="admin-tile__icon" aria-hidden="true">{tool.icon}</span>
              <span className="admin-tile__title">{tool.label}</span>
              <span className="admin-tile__description">{tool.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
