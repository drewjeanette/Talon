import { goToTodo } from "../lib/goTo";
import { RoleCalendar } from "./RoleCalendar";
import { WorkQueue } from "./WorkQueue";
import { ClockWidget } from "./ClockWidget";

/** Every supervisor's calendar sits beneath their clock, beside the to-do list. */
export function SupervisorOrganizer({ onClockChange }: { onClockChange: () => void }) {
  return (
    <div className="supervisor-organizer">
      <div className="supervisor-clock-column">
        <ClockWidget onChange={onClockChange} />
        <section className="supervisor-calendar" aria-label="Supervisor calendar">
          <RoleCalendar role="supervisor" />
        </section>
      </div>
      <WorkQueue title="To-Dos" className="supervisor-todos" onOpen={goToTodo} />
    </div>
  );
}
