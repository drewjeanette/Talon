import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { payrollDay, timecardDate as date, timecardPeriods, type TimecardPeriod } from "../lib/timecards";
import { StudentCategory } from "./StudentCategory";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy?: string | null;
  jobTitle?: string | null;
}

function hours(entry: TimeEntry): number {
  if (!entry.clockOut) return 0;
  return Math.max(0, (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3_600_000);
}

function TimecardTable({ entries, caption }: { entries: TimeEntry[]; caption: string }) {
  // Only students with more than one job need to see which job each shift was for.
  const showJob = new Set(entries.map((entry) => entry.jobTitle).filter(Boolean)).size > 1;
  return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table>
    <caption className="sr-only">{caption}</caption>
    <thead><tr>{showJob && <th scope="col">Job</th>}<th scope="col">Clock In</th><th scope="col">Clock Out</th><th scope="col">Hrs Worked</th><th scope="col">Status</th><th scope="col">Reviewed by</th></tr></thead>
    <tbody>
      {entries.length === 0 && <tr><td colSpan={showJob ? 6 : 5}>No time entries were recorded for this period.</td></tr>}
      {entries.map((entry) => <tr key={entry.id} className={entry.clockOut ? undefined : "talon-live-entry"}>
        {showJob && <td>{entry.jobTitle ?? "—"}</td>}
        <td>{new Date(entry.clockIn).toLocaleString(undefined, { timeZone: "America/Chicago" })}</td>
        <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString(undefined, { timeZone: "America/Chicago" }) : "In progress"}</td>
        <td>{entry.clockOut ? hours(entry).toFixed(2) : "—"}</td>
        <td className="talon-timecard__status">{entry.clockOut ? entry.status : "CLOCKED IN"}</td>
        <td>{entry.reviewedBy ? <span className="talon-timecard__signature">{entry.reviewedBy}</span> : ""}</td>
      </tr>)}
    </tbody>
  </table></div>;
}

export function StudentTimecards({ entries }: { entries: TimeEntry[] }) {
  const [periods, setPeriods] = useState<TimecardPeriod[]>([]);
  const [today, setToday] = useState(() => payrollDay(Date.now()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadPeriods() {
    setError(false);
    setLoading(true);
    try { setPeriods(await api.get<TimecardPeriod[]>("/payroll/timecard-periods")); }
    catch { setError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void loadPeriods();
    const refresh = () => setToday(payrollDay(Date.now()));
    const onFocus = () => { refresh(); void loadPeriods(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  const periodFor = useMemo(() => timecardPeriods(periods), [periods]);
  const current = periodFor(today);
  const currentEntries = entries.filter(entry => {
    const day = payrollDay(entry.clockIn);
    return current && day >= current.start && day <= current.end;
  });
  const groups = useMemo(() => {
    const past = new Map<number, { start: number; end: number; entries: TimeEntry[] }>();
    for (const { startDate, endDate } of periods) {
      const start = Date.parse(startDate.slice(0, 10));
      const end = Date.parse(endDate.slice(0, 10));
      if (end < today) past.set(start, { start, end, entries: [] });
    }
    for (const entry of entries) {
      const period = periodFor(payrollDay(entry.clockIn));
      if (!period || period.end >= today) continue;
      const group = past.get(period.start) ?? { ...period, entries: [] };
      group.entries.push(entry);
      past.set(period.start, group);
    }
    return [...past.values()].sort((a, b) => b.start - a.start);
  }, [entries, periodFor, periods, today]);
  const currentHours = currentEntries.reduce((total, entry) => total + hours(entry), 0);
  const unavailable = loading || error || !current;

  return <>
    <section className="card talon-current-timecard" aria-labelledby="talon-current-timecard-heading">
      <div className="talon-timecards__header">
        <h2 id="talon-current-timecard-heading">Current Timecard</h2>
        {!unavailable && <span className="talon-timecards__total">{date(current.start)} – {date(current.end)} · {currentHours.toFixed(2)} hrs</span>}
      </div>
      <p>Pay periods and shift times use Central time.</p>
      <p role="status">{loading ? "Loading timecards…" : error ? "Could not load the payroll calendar. Try again." : !current ? "No biweekly payroll calendar is available yet. Contact your supervisor." : ""}</p>
      {error && <button type="button" onClick={loadPeriods}>Retry timecards</button>}
      {!unavailable && <TimecardTable entries={currentEntries} caption="Current timecard" />}
    </section>

    <StudentCategory title="Past Timecards" description="View timecards from completed pay periods." className="student-category--timecards">
    <section className="card talon-past-timecards" aria-labelledby="talon-past-timecards-heading">
      <h2 id="talon-past-timecards-heading">Past Timecards</h2>
      <p>View your time entries from completed biweekly pay periods. All times are Central.</p>
      {!unavailable && groups.length === 0 && <p>No past timecards are available yet.</p>}
      {!unavailable && groups.map(({ start, end, entries: periodEntries }) => <details className="talon-timecard" key={start}>
        <summary><span className="talon-timecard__label"><strong>{date(start)} – {date(end)}</strong><small>{periodEntries.reduce((total, entry) => total + hours(entry), 0).toFixed(2)} hrs</small></span><span className="talon-timecard__arrow" aria-hidden="true">⌄</span></summary>
        <TimecardTable entries={periodEntries} caption={`Timecard ${date(start)} through ${date(end)}`} />
      </details>)}
    </section>
    </StudentCategory>
  </>;
}
