import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { notifyWorkChanged, waitingFor } from "../lib/work";
import { DateField } from "./DateField";
import type { Job } from "./ClockWidget";

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
  waitingOn: string[];
  createdAt: string;
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
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState("");
  const [supervisors, setSupervisors] = useState<string[] | null>(null);
  const [supervisorsError, setSupervisorsError] = useState(false);

  async function loadRequests() {
    const data = await api.get<CorrectionRequest[]>("/timeclock/correction-requests/mine");
    setRequests(data);
    return data;
  }

  useEffect(() => {
    api.get<{ hourlyRate: string | null }>("/users/me/pay-rate")
      .then((data) => setHourlyRate(data.hourlyRate))
      .catch(() => setHourlyRate(null));
    loadRequests().catch(() => setMessage("Could not load correction requests."));
    api.get<Job[]>("/timeclock/my-jobs").then(setJobs).catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSupervisors(null);
    setSupervisorsError(false);
    api.get<{ supervisors: string[] }>("/users/me/approvers").then((data) => {
      if (!cancelled) setSupervisors(data.supervisors);
    }).catch(() => { if (!cancelled) setSupervisorsError(true); });
    return () => { cancelled = true; };
  }, [open]);

  function closeForm() {
    setOpen(false);
    setTarget("new");
    setClockIn("");
    setClockOut("");
    setReason("");
    setJobId("");
  }

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
    if (target === "new" && jobs.length > 1 && !jobId) {
      setMessage("Choose which job the missed shift was for.");
      return;
    }
    setBusy(true);
    let submitted = false;
    try {
      const created = await api.post<{ id: number }>("/timeclock/correction-requests", {
        timeEntryId: target === "new" ? null : Number(target),
        ...(target === "new" && jobId ? { jobId: Number(jobId) } : {}),
        clockIn: new Date(clockIn).toISOString(),
        clockOut: new Date(clockOut).toISOString(),
        reason: reason.trim(),
      });
      submitted = true;
      setMessage("Correction sent for approval.");
      closeForm();
      const updatedRequests = await loadRequests();
      const approvers = updatedRequests.find((request) => request.id === created.id)?.waitingOn;
      if (approvers) setMessage(approvers.length
        ? `Correction sent to ${approvers.join(", ")} for approval.${approvers.length > 1 ? " Any assigned supervisor can approve it." : ""}`
        : "Correction sent to a payroll administrator for approval.");
      onSubmitted();
      notifyWorkChanged();
    } catch (error) {
      setMessage(submitted ? "Correction sent for approval, but the updated request could not be loaded. Refresh the page to see its status."
        : error instanceof ApiError ? error.message : "Could not submit the correction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card student-time-tools" aria-labelledby="time-help-heading">
      <h2 id="time-help-heading" tabIndex={-1}>Pay &amp; Time Corrections</h2>
      <p className="student-pay-rate">Your hourly pay rate: <strong>{hourlyRate === null ? "Not set" : `$${hourlyRate} per hour`}</strong></p>
      {!open && (
        <button type="button" className="student-time-tools__open" onClick={() => { setOpen(true); setMessage(""); }} aria-expanded={false} aria-controls="correction-card">
          Fix a missed clock-in or clock-out
        </button>
      )}
      {open && <form id="correction-card" onSubmit={submit} className="student-time-tools__card">
        <h3>Missed a clock-in or clock-out?</h3>
        <p>Choose a shift to edit, or request a completely missed shift. One of your supervisors must approve every change.</p>
        <div className="form-row">
          <label htmlFor="correction-shift">Shift to correct</label>
          <select id="correction-shift" value={target} onChange={(event) => chooseShift(event.target.value)} autoFocus>
            <option value="new">New missed shift</option>
            {entries.map((entry) => <option key={entry.id} value={entry.id}>{new Date(entry.clockIn).toLocaleString()}</option>)}
          </select>
        </div>
        {target === "new" && jobs.length > 1 && (
          <div className="form-row">
            <label htmlFor="correction-job">Job</label>
            <select id="correction-job" value={jobId} onChange={(event) => setJobId(event.target.value)} required>
              <option value="">Choose a job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </div>
        )}
        <div className="form-row-group">
          <DateField id="requested-clock-in" label="Correct clock-in" type="datetime-local" value={clockIn} onChange={setClockIn} commitLabel="Send for approval" required />
          <DateField id="requested-clock-out" label="Correct clock-out" type="datetime-local" value={clockOut} onChange={setClockOut} commitLabel="Send for approval" required />
        </div>
        <div className="form-row">
          <label htmlFor="correction-reason">Reason for the correction</label>
          <textarea id="correction-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder="Example: I forgot to clock out at the end of my shift." />
        </div>
        <p className="correction-recipient" aria-live="polite">
          {supervisorsError ? "Could not load your assigned supervisor. Your request will still be available to your assigned supervisors and admins."
            : supervisors === null ? "Loading assigned supervisor…"
            : supervisors.length ? <>Sent to: <strong>{supervisors.join(", ")}</strong>{supervisors.length > 1 && ". Any assigned supervisor can approve."}</>
            : "No supervisor assigned. An admin can review your request."}
        </p>
        <div className="button-row">
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send for approval"}</button>
          <button type="button" className="button--secondary" onClick={closeForm}>Cancel</button>
        </div>
      </form>}
      <p className="status-message" role="status" aria-live="polite">{message}</p>
      {requests.length > 0 && <div className="correction-history">
        <h3>Correction requests</h3>
        <ul>
          {requests.map((request) => <li key={request.id}>
            <strong>{request.timeEntryId ? "Shift correction" : "Missed shift"}: {request.status}</strong>
            <span>{new Date(request.requestedClockIn).toLocaleString()} – {new Date(request.requestedClockOut).toLocaleString()}</span>
            <span>Reason: {request.reason}</span>
            {request.status === "PENDING" && <span className="correction-history__waiting">{request.waitingOn.length === 1
              ? `Waiting for ${request.waitingOn[0]}’s approval.`
              : request.waitingOn.length > 1 ? `Waiting for approval from ${request.waitingOn.join(", ")}. Any assigned supervisor can approve.`
              : "Waiting for an admin’s approval. No supervisor is assigned."} · pending {waitingFor(request.createdAt)}</span>}
            {request.reviewerName && <span>Reviewed by {request.reviewerName}</span>}
            {request.reviewerReason && <span>Supervisor response: {request.reviewerReason}</span>}
          </li>)}
        </ul>
      </div>}
    </section>
  );
}
