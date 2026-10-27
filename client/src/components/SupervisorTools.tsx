import { useState, type ReactNode } from "react";
import { goTo } from "../lib/goTo";
import { ApprovalQueue } from "./ApprovalQueue";
import { PayRateManager } from "./PayRateManager";
import { PayrollReport } from "./PayrollReport";
import { PayStubList } from "./PayStubList";
import { TeamPayStubStatus } from "./TeamPayStubStatus";
import { TimesheetTable } from "./TimesheetTable";

function Category({ id, title, description, icon, children, selected, onSelect, onReveal }: {
  id: string; title: string; description: string; icon: string; children: ReactNode;
  selected: string | null; onSelect: (id: string) => void; onReveal: (id: string) => void;
}) {
  return (
    <details id={id} className="supervisor-tool" open={selected === id} hidden={selected !== null && selected !== id}
      onToggle={(event) => { if (event.currentTarget.open) onReveal(id); }}>
      <summary id={`${id}-trigger`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        onClick={(event) => { event.preventDefault(); onSelect(id); }}>
        <span className="supervisor-tool__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d={icon} /></svg>
        </span>
        <span className="supervisor-tool__copy">
          <span id={`${id}-title`} className="supervisor-tool__title">{title}</span>
          <span id={`${id}-description`} className="supervisor-tool__description">{description}</span>
        </span>
        <span className="supervisor-tool__arrow" aria-hidden="true">›</span>
      </summary>
      <div className="supervisor-tool__content">{children}</div>
    </details>
  );
}

export function SupervisorTools({ entries }: {
  entries: Parameters<typeof TimesheetTable>[0]["entries"];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const titles: Record<string, string> = {
    "supervisor-approvals": "Time Entry Approvals",
    "supervisor-stubs": "Student Pay Stubs",
    "supervisor-rates": "Student Hourly Pay Rates",
    "supervisor-reports": "Payroll Reports",
    "supervisor-my-stubs": "My Pay Stubs",
    "supervisor-my-time": "My Time Entries",
  };
  function selectCategory(id: string) {
    setSelected(id);
    goTo("#supervisor-section-heading");
  }
  function backToOverview() {
    const previous = selected;
    setSelected(null);
    window.requestAnimationFrame(() => {
      const trigger = document.getElementById(`${previous}-trigger`);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      trigger?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
      trigger?.focus({ preventScroll: true });
    });
  }
  const navigation = { selected, onSelect: selectCategory, onReveal: setSelected };
  return (
    <section className="supervisor-tools" aria-label="Supervisor tools" data-selected={selected ?? undefined}>
      <h2 id="supervisor-tools-heading" hidden={selected !== null}>Supervisor Tools</h2>
      <div className="supervisor-section-bar" hidden={selected === null}>
        <h2 id="supervisor-section-heading" tabIndex={-1}>{selected ? titles[selected] : ""}</h2>
        <button type="button" onClick={backToOverview}>Back to Overview</button>
      </div>
      <div className="supervisor-tool-grid">
        <Category {...navigation} id="supervisor-approvals" title="Time Entry Approvals" description="Review clock entries, missed punches, and time corrections." icon="M20 6 9 17l-5-5">
          <ApprovalQueue active={selected === "supervisor-approvals"} />
        </Category>
        <Category {...navigation} id="supervisor-stubs" title="Student Pay Stubs" description="Review student pay stubs and answer payroll questions." icon="M6 3h9l3 3v15H6z M14 3v4h4 M9 11h6 M9 15h6">
          <TeamPayStubStatus />
        </Category>
        <Category {...navigation} id="supervisor-rates" title="Student Hourly Pay Rates" description="Manage hourly rates for students assigned to you." icon="M3 5h18v14H3z M7 9h10 M7 13h4 M15 13h2">
          <PayRateManager />
        </Category>
        <Category {...navigation} id="supervisor-reports" title="Payroll Reports" description="Compare student hours and pay, download reports, and mark them reviewed." icon="M4 3h16v18H4z M8 16v-3 M12 16V8 M16 16v-5">
          <PayrollReport />
        </Category>
        <Category {...navigation} id="supervisor-my-stubs" title="My Pay Stubs" description="View and download your own pay stubs." icon="M6 3h9l3 3v15H6z M14 3v4h4 M9 11h6 M9 15h6">
          <PayStubList />
        </Category>
        <Category {...navigation} id="supervisor-my-time" title="My Time Entries" description="View your own recent clock-in and clock-out times." icon="M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0">
          <TimesheetTable entries={entries} caption="My recent time entries" />
        </Category>
      </div>
    </section>
  );
}
