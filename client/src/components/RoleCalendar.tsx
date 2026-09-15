import { useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RoleCalendar({ role }: { role: "admin" | "supervisor" }) {
  const [month, setMonth] = useState(() => new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) =>
    index < firstWeekday ? null : index - firstWeekday + 1
  );

  function changeMonth(offset: number) {
    setMonth(new Date(year, monthIndex + offset, 1));
  }

  return (
    <div className={role === "admin" ? "admin-calendar" : undefined} aria-label="Calendar">
      <div className={`${role}-calendar__header`}>
        <button type="button" className={`${role}-calendar__nav`} onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
        <h3 className={`${role}-calendar__title`} aria-live="polite">
          {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month)}
        </h3>
        <button type="button" className={`${role}-calendar__nav`} onClick={() => changeMonth(1)} aria-label="Next month">›</button>
      </div>
      <div className={`${role}-calendar__weekdays`} aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className={`${role}-calendar__days`} aria-label={`Days in ${new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month)}`}>
        {cells.map((day, index) => {
          const isToday = day !== null && year === today.getFullYear() && monthIndex === today.getMonth() && day === today.getDate();
          return <span key={index} className={`${role}-calendar__day${isToday ? ` ${role}-calendar__day--today` : ""}`} aria-current={isToday ? "date" : undefined}>{day}</span>;
        })}
      </div>
    </div>
  );
}
