import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Entry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "APPROVED" | "PENDING" | "REJECTED";
  jobTitle: string | null;
  minutes: number | null;
}

export function StudentComparisonEntries({ studentId, name }: { studentId: number; name: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(false);
    api.get<Entry[]>(`/timeclock/students/${studentId}/entries`).then((data) => {
      if (!cancelled) setEntries(data);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [studentId, attempt]);

  return <section aria-label={`Time entries for ${name}`}>
    <h5 className="student-comparison__entries-heading">Time entries</h5>
    <p>Latest 100 shifts, newest first. Hours include completed shifts only.</p>
    <p role="status">{error ? "Could not load time entries." : entries === null ? "Loading time entries…" : `${entries.length} shifts loaded.`}</p>
    {error && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry time entries</button>}
    {entries !== null && <>
      <dl className="student-comparison__details">
        {(["APPROVED", "PENDING", "REJECTED"] as const).map((status) => <div key={status}>
          <dt>{status === "APPROVED" ? "Approved hours" : status === "PENDING" ? "Pending hours" : "Rejected hours"}</dt>
          <dd>{(entries.filter((entry) => entry.status === status).reduce((total, entry) => total + (entry.minutes ?? 0), 0) / 60).toFixed(2)}</dd>
        </div>)}
      </dl>
      {entries.length === 0 ? <p>No time entries recorded.</p> : <div className="student-comparison__entries" role="region" aria-label={`Shift history for ${name}`} tabIndex={0}>
        <ul>
          {entries.map((entry) => <li key={entry.id}>
            <strong>{entry.jobTitle ?? "Unassigned job"}</strong>
            <dl className="student-comparison__details">
              <div><dt>Clock In</dt><dd>{new Date(entry.clockIn).toLocaleString()}</dd></div>
              <div><dt>Clock Out</dt><dd>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</dd></div>
              <div><dt>Hours</dt><dd>{entry.minutes === null ? "In progress" : (entry.minutes / 60).toFixed(2)}</dd></div>
              <div><dt>Status</dt><dd>{entry.clockOut ? entry.status : "CLOCKED IN"}</dd></div>
            </dl>
          </li>)}
        </ul>
      </div>}
    </>}
  </section>;
}
