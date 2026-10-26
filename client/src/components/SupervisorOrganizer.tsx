import { goToTodo } from "../lib/goTo";
import { RoleCalendar } from "./RoleCalendar";
import { WorkQueue } from "./WorkQueue";
import { ClockWidget } from "./ClockWidget";

/** Every supervisor's clock stays visible before their to-do list and calendar. */
export function SupervisorOrganizer({ onClockChange }: { onClockChange: () => void }) {
  return (
    <div className="supervisor-organizer">
      <ClockWidget onChange={onClockChange} />
      <WorkQueue title="To-Dos" className="supervisor-todos" onOpen={goToTodo} />
      <section className="supervisor-calendar" aria-label="Supervisor calendar">
        <RoleCalendar role="supervisor" />
      </section>
    </div>
  );
}
