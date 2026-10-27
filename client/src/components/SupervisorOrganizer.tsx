import type { ReactNode } from "react";
import { goToTodo } from "../lib/goTo";
import { RoleCalendar } from "./RoleCalendar";
import { WorkQueue } from "./WorkQueue";
import { ClockWidget } from "./ClockWidget";

/** Keep the clock and calendar beside the supervisor's tasks and categories. */
export function SupervisorOrganizer({ onClockChange, children }: { onClockChange: () => void; children: ReactNode }) {
  return (
    <div className="supervisor-organizer">
      <div className="supervisor-clock-column">
        <ClockWidget onChange={onClockChange} />
        <section className="supervisor-calendar" aria-label="Supervisor calendar">
          <RoleCalendar role="supervisor" />
        </section>
      </div>
      <div className="supervisor-work-column">
        <WorkQueue title="To-Dos" className="supervisor-todos" onOpen={goToTodo} />
        {children}
      </div>
    </div>
  );
}
