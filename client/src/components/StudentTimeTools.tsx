import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";

interface TimeEntryOption {
  id: number;
  clockIn: string;
  clockOut: string | null;
}

interface CorrectionRequest {
  id: number;
  timeEntryId: number | null;
  requestedClockIn: string;
  requestedClockOut: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewerName: string | null;
  reviewerReason: string | null;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function StudentTimeTools({ entries, onSubmitted }: { entries: TimeEntryOption[]; onSubmitted: () => void }) {
  const [hourlyRate, setHourlyRate] = useState<string | null>(null);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [target, setTarget] = useState("new");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadRequests() {
    setRequests(await api.get<CorrectionRequest[]>("/timeclock/correction-requests/mine"));
  }

  useEffect(() => {
    api.get<{ hourlyRate: string | null }>("/users/me/pay-rate")
      .then((data) => setHourlyRate(data.hourlyRate))
      .catch(() => setHourlyRate(null));
    loadRequests().catch(() => setMessage("Could not load correction requests."));
  }, []);

  function chooseShift(value: string) {
    setTarget(value);
    if (value === "new") {
      setClockIn("");
      setClockOut("");
      return;
    }
    const entry = entries.find((item) => item.id === Number(value));
    if (entry) {
      setClockIn(toLocalInput(entry.clockIn));
      setClockOut(entry.clockOut ? toLocalInput(entry.clockOut) : "");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!clockIn || !clockOut || !reason.trim()) {
      setMessage("Enter the corrected clock-in, clock-out, and reason.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/timeclock/correction-requests", {
        timeEntryId: target === "new" ? null : Number(target),
        clockIn: new Date(clockIn).toISOString(),
        clockOut: new Date(clockOut).toISOString(),
        reason: reason.trim(),
      });
      setMessage("Correction sent to your supervisor for approval.");
      setReason("");
      await loadRequests();
      onSubmitted();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not submit the correction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card student-time-tools" aria-labelledby="time-help-heading">
      <h2 id="time-help-heading">Pay &amp; Time Corrections</h2>
      <p className="student-pay-rate">Your hourly pay rate: <strong>{hourlyRate === null ? "Not set" : `$${hourlyRate} per hour`}</strong></p>
      <form onSubmit={submit}>
        <h3>Missed a clock-in or clock-out?</h3>
        <p>Choose a shift to edit, or request a completely missed shift. Your supervisor must approve every change.</p>
        <div className="form-row">
          <label htmlFor="correction-shift">Shift to correct</label>
          <select id="correction-shift" value={target} onChange={(event) => chooseShift(event.target.value)}>
            <option value="new">New missed shift</option>
            {entries.map((entry) => <option key={entry.id} value={entry.id}>{new Date(entry.clockIn).toLocaleString()}</option>)}
          </select>
        </div>
        <div className="form-row-group">
          <div className="form-row">
            <label htmlFor="requested-clock-in">Correct clock-in</label>
            <input id="requested-clock-in" type="datetime-local" value={clockIn} onChange={(event) => setClockIn(event.target.value)} required />
          </div>
          <div className="form-row">
            <label htmlFor="requested-clock-out">Correct clock-out</label>
            <input id="requested-clock-out" type="datetime-local" value={clockOut} onChange={(event) => setClockOut(event.target.value)} required />
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="correction-reason">Reason for the correction</label>
          <textarea id="correction-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder="Example: I forgot to clock out at the end of my shift." />
        </div>
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send for approval"}</button>
      </form>
      <p className="status-message" role="status" aria-live="polite">{message}</p>
      {requests.length > 0 && <div className="correction-history">
        <h3>Correction requests</h3>
        <ul>
          {requests.map((request) => <li key={request.id}>
            <strong>{request.timeEntryId ? "Shift correction" : "Missed shift"}: {request.status}</strong>
            <span>{new Date(request.requestedClockIn).toLocaleString()} – {new Date(request.requestedClockOut).toLocaleString()}</span>
            <span>Reason: {request.reason}</span>
            {request.reviewerName && <span>Reviewed by {request.reviewerName}</span>}
            {request.reviewerReason && <span>Supervisor response: {request.reviewerReason}</span>}
          </li>)}
        </ul>
      </div>}
    </section>
  );
}
