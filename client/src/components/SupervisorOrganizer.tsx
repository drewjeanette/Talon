import { useEffect, useState } from "react";
import { RoleCalendar } from "./RoleCalendar";

const REMINDERS = [
  { id: "entries", label: "Review pending time entries" },
  { id: "paystubs", label: "Check my pay stubs" },
  { id: "report", label: "Review payroll reports" },
];

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function SupervisorOrganizer({ userId }: { userId: number }) {
  const storageKey = `talon-supervisor-reminders:${userId}:${localDateKey()}`;
  const [completed, setCompleted] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [removing, setRemoving] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(completed));
    } catch {
      // The checklist still works when browser storage is unavailable.
    }
  }, [completed, storageKey]);

  function finish(id: string) {
    if (removing.includes(id)) return;
    setRemoving((items) => [...items, id]);
    window.setTimeout(() => {
      setCompleted((items) => [...items, id]);
      setRemoving((items) => items.filter((item) => item !== id));
    }, 220);
  }

  const visible = REMINDERS.filter((item) => !completed.includes(item.id));
  const allDone = visible.length === 0;

  return (
    <div className="supervisor-organizer">
      <section className={`supervisor-todos${allDone ? " supervisor-todos--complete" : ""}`} aria-labelledby="supervisor-reminders-heading">
        <h2 id="supervisor-reminders-heading" className="supervisor-organizer__title">Today's reminders</h2>
        <div className="supervisor-todo-list">
          {allDone ? (
            <div role="status" aria-live="polite">
              <span className="supervisor-success" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M10 25l10 10 18-22" /></svg></span>
              <p className="supervisor-todo-empty">All reminders complete!</p>
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
        <h2 className="supervisor-organizer__title">Calendar</h2>
        <RoleCalendar role="supervisor" />
      </section>
    </div>
  );
}
