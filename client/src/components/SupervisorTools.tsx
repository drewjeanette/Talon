import type { ReactNode } from "react";
import { ApprovalQueue } from "./ApprovalQueue";
import { ClockWidget } from "./ClockWidget";
import { PayRateManager } from "./PayRateManager";
import { PayrollReport } from "./PayrollReport";
import { PayStubList } from "./PayStubList";
import { TeamPayStubStatus } from "./TeamPayStubStatus";
import { TimesheetTable } from "./TimesheetTable";

function Category({ id, title, description, icon, children }: {
  id: string; title: string; description: string; icon: string; children: ReactNode;
}) {
  return (
    <details className="supervisor-tool">
      <summary aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <span className="supervisor-tool__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d={icon} /></svg>
        </span>
        <span className="supervisor-tool__copy">
          <span id={`${id}-title`} className="supervisor-tool__title">{title}</span>
          <span id={`${id}-description`} className="supervisor-tool__description">{description}</span>
        </span>
        <span className="supervisor-tool__arrow" aria-hidden="true">⌄</span>
      </summary>
      <div className="supervisor-tool__content">{children}</div>
    </details>
  );
}

export function SupervisorTools({ clocksIn, entries, onEntriesChanged }: {
  clocksIn: boolean;
  entries: Parameters<typeof TimesheetTable>[0]["entries"];
  onEntriesChanged: () => void;
}) {
  return (
    <section className="supervisor-tools" aria-labelledby="supervisor-tools-heading">
      <h2 id="supervisor-tools-heading">Supervisor Tools</h2>
      <div className="supervisor-tool-grid">
        <Category id="supervisor-approvals" title="Time Entry Approvals" description="Review clock entries, missed punches, and time corrections." icon="M20 6 9 17l-5-5">
          <ApprovalQueue />
        </Category>
        <Category id="supervisor-stubs" title="Student Pay Stubs" description="Review student pay stubs and answer payroll questions." icon="M6 3h9l3 3v15H6z M14 3v4h4 M9 11h6 M9 15h6">
          <TeamPayStubStatus />
        </Category>
        <Category id="supervisor-rates" title="Student Hourly Pay Rates" description="Manage hourly rates for students assigned to you." icon="M3 5h18v14H3z M7 9h10 M7 13h4 M15 13h2">
          <PayRateManager />
        </Category>
        <Category id="supervisor-reports" title="Payroll Reports" description="Compare student hours and pay, download reports, and mark them reviewed." icon="M4 3h16v18H4z M8 16v-3 M12 16V8 M16 16v-5">
          <PayrollReport />
        </Category>
        <Category id="supervisor-my-stubs" title="My Pay Stubs" description="View and download your own pay stubs." icon="M6 3h9l3 3v15H6z M14 3v4h4 M9 11h6 M9 15h6">
          <PayStubList />
        </Category>
        {clocksIn && <Category id="supervisor-my-time" title="My Web Clock & Time Entries" description="Clock in or out and view your own recent time entries." icon="M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0">
          <ClockWidget onChange={onEntriesChanged} />
          <TimesheetTable entries={entries} caption="My recent time entries" />
        </Category>}
      </div>
    </section>
  );
}
