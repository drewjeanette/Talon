import { useState } from "react";
import { RoleCalendar } from "./RoleCalendar";

const REMINDERS = [
  { id: "entries", label: "Review pending time entries", target: "#approvals-heading" },
  { id: "report", label: "Confirm payroll report details", target: "#report-heading" },
  { id: "paystubs", label: "Check employee pay-stub statuses", target: "#team-paystubs-heading" },
];

export function SupervisorOrganizer({ reportSender }: { reportSender?: string | null }) {
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

  function goTo(target: string) {
    const element = document.querySelector(target) as HTMLElement | null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    element?.focus({ preventScroll: true });
  }

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
            <div key={item.id} className={`supervisor-todo${removing.includes(item.id) ? " supervisor-todo--removing" : ""}`}>
              <input type="checkbox" aria-label={`Mark ${item.label} complete`} checked={removing.includes(item.id)} onChange={() => finish(item.id)} />
              <button type="button" className="supervisor-todo__link" onClick={() => goTo(item.target)}>{item.id === "report" && reportSender ? `Review payroll report from ${reportSender}` : item.label}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="supervisor-calendar" aria-label="Supervisor calendar">
        <RoleCalendar role="supervisor" />
      </section>
    </div>
  );
}
