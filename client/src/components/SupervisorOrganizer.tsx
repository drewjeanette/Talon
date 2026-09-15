import { useState } from "react";
import { RoleCalendar } from "./RoleCalendar";

const REMINDERS = [
  { id: "entries", label: "Review pending time entries" },
  { id: "report", label: "Confirm payroll report details" },
  { id: "paystubs", label: "Check employee pay-stub statuses" },
];

export function SupervisorOrganizer() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string[]>([]);

  function finish(id: string) {
    if (removing.includes(id)) return;
    setRemoving((items) => [...items, id]);
    window.setTimeout(() => {
      setCompleted((items) => [...items, id]);
      setRemoving((items) => items.filter((item) => item !== id));
    }, 240);
  }

  const visible = REMINDERS.filter((item) => !completed.includes(item.id));
  const allDone = visible.length === 0;

  return (
    <div className="supervisor-organizer">
      <section className={`supervisor-todos${allDone ? " supervisor-todos--complete" : ""}`} aria-labelledby="supervisor-reminders-heading">
        <h2 id="supervisor-reminders-heading" className="supervisor-organizer__title">To-Dos</h2>
        <div className="supervisor-todo-list">
          {allDone ? (
            <div role="status" aria-live="polite">
              <span className="supervisor-success" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M14 33l12 12 25-28" /></svg></span>
              <p className="supervisor-todo-empty">All Clear For Now! No Pending Tasks.</p>
            </div>
          ) : visible.map((item) => (
            <label key={item.id} className={`supervisor-todo${removing.includes(item.id) ? " supervisor-todo--removing" : ""}`}>
              <input type="checkbox" checked={removing.includes(item.id)} onChange={() => finish(item.id)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="supervisor-calendar" aria-label="Supervisor calendar">
        <RoleCalendar role="supervisor" />
      </section>
    </div>
  );
}
