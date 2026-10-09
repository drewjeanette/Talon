import { goToTodo } from "../lib/goTo";
import { RoleCalendar } from "./RoleCalendar";
import { WorkQueue } from "./WorkQueue";

/** The supervisor's one to-do list (items clear when the work is done) beside the calendar. */
export function SupervisorOrganizer() {
  return (
    <div className="supervisor-organizer">
      <WorkQueue title="To-Dos" className="supervisor-todos" onOpen={goToTodo} />
      <section className="supervisor-calendar" aria-label="Supervisor calendar">
        <RoleCalendar role="supervisor" />
      </section>
    </div>
  );
}
