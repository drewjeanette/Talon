import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy?: string | null;
}

interface PayStub {
  id: number;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  hourlyRate: string | null;
  status: "DRAFT" | "FINALIZED" | "PAID";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy?: string | null;
  reviewReason?: string | null;
  processedBy?: string | null;
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

function hours(entry: TimeEntry): number {
  if (!entry.clockOut) return 0;
  return Math.max(0, (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3_600_000);
}

function date(value: string): string {
  return new Date(value).toLocaleDateString();
}

function TimecardTable({ entries, caption }: { entries: TimeEntry[]; caption: string }) {
  return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table>
    <caption className="sr-only">{caption}</caption>
    <thead><tr><th scope="col">Clock In</th><th scope="col">Clock Out</th><th scope="col">Hrs Worked</th><th scope="col">Status</th><th scope="col">Reviewed By</th></tr></thead>
    <tbody>
      {entries.length === 0 && <tr><td colSpan={5}>No time entries were recorded for this period.</td></tr>}
      {entries.map((entry) => <tr key={entry.id} className={entry.clockOut ? undefined : "talon-live-entry"}>
        <td>{new Date(entry.clockIn).toLocaleString()}</td>
        <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
        <td>{entry.clockOut ? hours(entry).toFixed(2) : "—"}</td>
        <td className="talon-timecard__status">{entry.clockOut ? entry.status : "CLOCKED IN"}</td>
        <td>{entry.reviewedBy ? <span className="talon-timecard__signature">{entry.reviewedBy}</span> : "—"}</td>
      </tr>)}
    </tbody>
  </table></div>;
}

export function StudentTimecards({ entries }: { entries: TimeEntry[] }) {
  const [stubs, setStubs] = useState<PayStub[]>([]);

  useEffect(() => {
    api.get<PayStub[]>("/payroll/my-stubs").then(setStubs).catch(() => setStubs([]));
  }, []);

  const groups = useMemo(() => stubs.map((stub) => {
    const start = new Date(stub.payPeriod.startDate).getTime();
    const end = new Date(stub.payPeriod.endDate).getTime() + 86_400_000 - 1;
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
      <TimecardTable entries={currentEntries} caption="Current timecard" />
    </section>

    <section className="card talon-student-paystubs" aria-labelledby="talon-student-paystubs-heading">
      <h2 id="talon-student-paystubs-heading">My Pay Stubs</h2>
      <div className="table-scroll" role="region" aria-label="Biweekly pay stubs" tabIndex={0}><table>
        <caption className="sr-only">Biweekly pay stubs</caption>
        <thead><tr><th scope="col">Pay Period</th><th scope="col">Pay</th><th scope="col">Pay Date</th><th scope="col">Hrs Worked</th><th scope="col">Gross Pay</th><th scope="col">Payroll Status</th><th scope="col">Review Status</th><th scope="col">Reviewed By</th></tr></thead>
        <tbody>
          {stubs.length === 0 && <tr><td colSpan={8}>No pay stubs are available yet.</td></tr>}
          {stubs.map((stub) => <tr key={stub.id}>
            <td>{date(stub.payPeriod.startDate)} – {date(stub.payPeriod.endDate)}</td>
            <td>{stub.hourlyRate === null ? "—" : `$${stub.hourlyRate}`}</td>
            <td>{date(stub.payPeriod.payDate)}</td>
            <td>{(Number(stub.regularHours) + Number(stub.overtimeHours)).toFixed(2)}</td>
            <td>${stub.grossPay}</td>
            <td className="talon-timecard__status">{stub.status}</td>
            <td className="talon-timecard__status">{stub.reviewStatus}</td>
            <td>{stub.reviewedBy ? <span className="talon-timecard__signature">{stub.reviewedBy}</span> : "—"}{stub.reviewReason && <small className="talon-review-reason">{stub.reviewReason}</small>}</td>
          </tr>)}
        </tbody>
      </table></div>
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
