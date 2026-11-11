import { useEffect, useState } from "react";
import { api } from "../api/client";
import { payrollDay } from "../lib/timecards";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
});

interface StaffShift {
  name: string;
  role: string;
  days: number[];
  hours: string;
}

export function RoleCalendar({ role }: { role: "admin" | "supervisor" }) {
  const [selected, setSelected] = useState(() => new Date(payrollDay(Date.now())));
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState<StaffShift[] | null>();
  const year = selected.getUTCFullYear();
  const monthIndex = selected.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const today = payrollDay(Date.now());
  const monthLabel = monthFormat.format(firstDay);
  const shifts = schedule?.filter((shift) => shift.days.includes(selected.getUTCDay()));
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) =>
    index < firstWeekday ? null : index - firstWeekday + 1
  );

  useEffect(() => {
    if (!showSchedule) return;
    let current = true;
    api.get<StaffShift[]>("/org/staff-schedule").then(
      (data) => { if (current) setSchedule(data); },
      () => { if (current) setSchedule(null); },
    );
    return () => { current = false; };
  }, [showSchedule]);

  function changeMonth(offset: number) {
    const destination = new Date(Date.UTC(year, monthIndex + offset, 1));
    const centralToday = new Date(today);
    const isCurrentMonth = destination.getUTCFullYear() === centralToday.getUTCFullYear()
      && destination.getUTCMonth() === centralToday.getUTCMonth();
    setSelected(isCurrentMonth ? centralToday : destination);
  }

  return (
    <div className={role === "admin" ? "admin-calendar" : undefined} role="group" aria-labelledby={`${role}-calendar-heading`}>
      <div className={`${role}-calendar__header`}>
        <button type="button" className={`${role}-calendar__nav`} onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
        <h3 id={`${role}-calendar-heading`} className={`${role}-calendar__title`} aria-live="polite">{monthLabel}</h3>
        <button type="button" className={`${role}-calendar__nav`} onClick={() => changeMonth(1)} aria-label="Next month">›</button>
      </div>
      <label className="staff-schedule__toggle">
        <input type="checkbox" checked={showSchedule} onChange={(event) => {
          setSchedule(undefined);
          setShowSchedule(event.target.checked);
        }} />
        Show Who’s Working
      </label>
      <div className={`${role}-calendar__weekdays`} aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className={`${role}-calendar__days`} role={showSchedule ? "radiogroup" : "list"} aria-label={`Days in ${monthLabel}`}>
        {cells.map((day, index) => {
          if (day === null) return <span key={index} aria-hidden="true" />;
          const date = new Date(Date.UTC(year, monthIndex, day));
          const fullDate = dateFormat.format(date);
          const isToday = date.getTime() === today;
          const dayClass = `${role}-calendar__day${isToday ? ` ${role}-calendar__day--today` : ""}`;

          return showSchedule ? (
            <label key={index} className="staff-schedule__date">
              <input className="sr-only" type="radio" name={`${role}-schedule-date`} aria-label={fullDate}
                aria-current={isToday ? "date" : undefined} checked={day === selected.getUTCDate()}
                onChange={() => setSelected(date)} />
              <span className={dayClass} aria-hidden="true">{day}</span>
            </label>
          ) : <span key={index} role="listitem" aria-label={fullDate} className={dayClass} aria-current={isToday ? "date" : undefined}>{day}</span>;
        })}
      </div>
      {showSchedule && (
        <div className="staff-schedule__panel" aria-live="polite" aria-atomic="true">
          <h4>{dateFormat.format(selected)}</h4>
          <p>Scheduled shifts · Central time</p>
          {shifts ? shifts.length ? (
            <ul>
              {shifts.map((shift) => (
                <li key={shift.name}>
                  <strong>{shift.name}</strong> <span>({shift.role})</span>
                  <span className="staff-schedule__hours">{shift.hours}</span>
                </li>
              ))}
            </ul>
          ) : <p>No staff scheduled.</p> : (
            <p>{schedule === null ? "Couldn’t load the schedule. Uncheck and recheck to retry." : "Loading schedule…"}</p>
          )}
        </div>
      )}
    </div>
  );
}
