import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { waitingFor } from "../lib/work";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy?: string | null;
  jobTitle?: string | null;
}

/** Only the dates are needed here: stubs mark where past timecards begin and end. */
interface PayStub {
  id: number;
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

function hours(entry: TimeEntry): number {
  if (!entry.clockOut) return 0;
  return Math.max(0, (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3_600_000);
}

function date(value: string): string {
  return new Date(value).toLocaleDateString();
}

/** `waitingOn` names who can approve pending shifts; shown with how long each has waited. */
function TimecardTable({ entries, caption, waitingOn }: { entries: TimeEntry[]; caption: string; waitingOn?: string }) {
  // Only students with more than one job need to see which job each shift was for.
  const showJob = new Set(entries.map((entry) => entry.jobTitle).filter(Boolean)).size > 1;
  return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table>
    <caption className="sr-only">{caption}</caption>
    <thead><tr>{showJob && <th scope="col">Job</th>}<th scope="col">Clock In</th><th scope="col">Clock Out</th><th scope="col">Hrs Worked</th><th scope="col">Status</th><th scope="col">{waitingOn ? "Reviewed By / Waiting On" : "Reviewed By"}</th></tr></thead>
    <tbody>
      {entries.length === 0 && <tr><td colSpan={showJob ? 6 : 5}>No time entries were recorded for this period.</td></tr>}
      {entries.map((entry) => <tr key={entry.id} className={entry.clockOut ? undefined : "talon-live-entry"}>
        {showJob && <td>{entry.jobTitle ?? "—"}</td>}
        <td>{new Date(entry.clockIn).toLocaleString()}</td>
        <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
        <td>{entry.clockOut ? hours(entry).toFixed(2) : "—"}</td>
        <td className="talon-timecard__status">{entry.clockOut ? entry.status : "CLOCKED IN"}</td>
        <td>
          {entry.reviewedBy
            ? <span className="talon-timecard__signature">{entry.reviewedBy}</span>
            : waitingOn && entry.status === "PENDING" && entry.clockOut
              ? <span className="timecard-waiting">Waiting on {waitingOn} · {waitingFor(entry.clockOut)}</span>
              : "—"}
        </td>
      </tr>)}
    </tbody>
  </table></div>;
}

export function StudentTimecards({ entries, waitingOn }: { entries: TimeEntry[]; waitingOn: string }) {
  const [stubs, setStubs] = useState<PayStub[]>([]);

  useEffect(() => {
    api.get<PayStub[]>("/payroll/my-stubs").then(setStubs).catch(() => setStubs([]));
  }, []);

  const groups = useMemo(() => stubs.map((stub) => {
    const start = new Date(stub.payPeriod.startDate).getTime();
    // Through the end of the period's last day, whether endDate is midnight or 23:59.
    const end = Math.floor(new Date(stub.payPeriod.endDate).getTime() / 86_400_000) * 86_400_000 + 86_400_000 - 1;
    return { stub, entries: entries.filter((entry) => {
      const clockIn = new Date(entry.clockIn).getTime();
      return clockIn >= start && clockIn <= end;
    }) };
  }), [entries, stubs]);

  const pastIds = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.id)));
  const currentEntries = entries.filter((entry) => !pastIds.has(entry.id));
  const currentHours = currentEntries.reduce((total, entry) => total + hours(entry), 0);
  const latestEnd = stubs[0] ? new Date(stubs[0].payPeriod.endDate) : null;
  const currentStart = latestEnd ? new Date(latestEnd.getTime() + 86_400_000) : (currentEntries.at(-1) ? new Date(currentEntries.at(-1)!.clockIn) : new Date());
  const currentEnd = new Date(currentStart.getTime() + 13 * 86_400_000);

  return <>
    <section className="card talon-current-timecard" aria-labelledby="talon-current-timecard-heading">
      <div className="talon-timecards__header">
        <h2 id="talon-current-timecard-heading">Current Timecard</h2>
        <span className="talon-timecards__total">{date(currentStart.toISOString())} – {date(currentEnd.toISOString())} · {currentHours.toFixed(2)} hrs</span>
      </div>
      <TimecardTable entries={currentEntries} caption="Current timecard" waitingOn={waitingOn} />
    </section>

    <section className="card talon-past-timecards" aria-labelledby="talon-past-timecards-heading">
      <h2 id="talon-past-timecards-heading">Past Timecards</h2>
      {groups.length === 0 && <p>No past timecards are available yet.</p>}
      {groups.map(({ stub, entries: periodEntries }) => <details className="talon-timecard" key={stub.id}>
        <summary><span className="talon-timecard__label"><strong>{date(stub.payPeriod.startDate)} – {date(stub.payPeriod.endDate)}</strong><small>{periodEntries.reduce((total, entry) => total + hours(entry), 0).toFixed(2)} hrs</small></span><span className="talon-timecard__arrow" aria-hidden="true">⌄</span></summary>
        <TimecardTable entries={periodEntries} caption={`Timecard ${date(stub.payPeriod.startDate)} through ${date(stub.payPeriod.endDate)}`} />
      </details>)}
    </section>
  </>;
}
