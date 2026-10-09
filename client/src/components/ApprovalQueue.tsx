import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { notifyWorkChanged, waitingFor } from "../lib/work";
import { PersonSearch } from "./PersonSearch";

interface Person { id: number; firstName: string; lastName: string; preferredName: string | null; fullName: string }

interface PendingEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  submittedAt: string | null;
  chargeAccount: { code: string; name: string } | null;
  user: Person;
}

interface PendingCorrection {
  id: number;
  timeEntryId: number | null;
  requestedClockIn: string;
  requestedClockOut: string;
  currentClockIn: string | null;
  currentClockOut: string | null;
  reason: string;
  submittedAt: string;
  user: Person;
}

type RejectTarget = { kind: "entry" | "correction"; id: number } | null;

export function ApprovalQueue() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [corrections, setCorrections] = useState<PendingCorrection[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<{ action: string; name: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [studentFilter, setStudentFilter] = useState<number[]>([]);

  async function load() {
    const [pendingEntries, pendingCorrections] = await Promise.all([
      api.get<PendingEntry[]>("/timeclock/pending"),
      api.get<PendingCorrection[]>("/timeclock/correction-requests/pending"),
    ]);
    setEntries(pendingEntries);
    setCorrections(pendingCorrections);
  }

  useEffect(() => { load().catch(() => setMessage("Could not load pending time requests.")); }, []);

  const students = useMemo(() => {
    const map = new Map<number, Person>();
    for (const item of [...entries, ...corrections]) map.set(item.user.id, item.user);
    return [...map.values()];
  }, [entries, corrections]);
  const showEntry = (item: { user: Person }) => !studentFilter.length || studentFilter.includes(item.user.id);
  const shownEntries = entries.filter(showEntry);
  const shownCorrections = corrections.filter(showEntry);

  function openReject(kind: "entry" | "correction", id: number) {
    setRejectTarget({ kind, id });
    setRejectionReason("");
    setMessage(null);
  }

  async function decideEntry(id: number, status: "APPROVED" | "REJECTED") {
    if (status === "REJECTED" && rejectionReason.trim().length < 3) {
      setMessage("Enter a reason before rejecting the time entry.");
      return;
    }
    setMessage(null);
    try {
      await api.patch(`/timeclock/${id}/decision`, {
        status,
        ...(status === "REJECTED" ? { rejectionReason: rejectionReason.trim() } : {}),
      });
      setMessage(`Time entry ${status === "APPROVED" ? "approved" : "rejected"}.`);
      setAttribution({ action: status === "APPROVED" ? "Approved by" : "Rejected by", name: user?.firstName ?? "Supervisor" });
      setRejectTarget(null);
      await load();
      notifyWorkChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update the time entry.");
    }
  }

  async function decideCorrection(id: number, status: "APPROVED" | "REJECTED") {
    if (status === "REJECTED" && rejectionReason.trim().length < 3) {
      setMessage("Enter a reason before denying the correction.");
      return;
    }
    setMessage(null);
    try {
      await api.patch(`/timeclock/correction-requests/${id}/decision`, {
        status,
        ...(status === "REJECTED" ? { reviewerReason: rejectionReason.trim() } : {}),
      });
      setMessage(`Correction request ${status === "APPROVED" ? "approved" : "denied"}.`);
      setAttribution({ action: status === "APPROVED" ? "Approved by" : "Denied by", name: user?.firstName ?? "Supervisor" });
      setRejectTarget(null);
      await load();
      notifyWorkChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update the correction request.");
    }
  }

  function rejectionForm(kind: "entry" | "correction", id: number) {
    if (rejectTarget?.kind !== kind || rejectTarget.id !== id) return null;
    return <div className="approval-rejection-form">
      <label htmlFor={`reject-${kind}-${id}`}>Reason for {kind === "entry" ? "rejection" : "denial"}</label>
      <textarea id={`reject-${kind}-${id}`} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} autoFocus required />
      <div className="button-row">
        <button type="button" className="button--danger" onClick={() => kind === "entry" ? decideEntry(id, "REJECTED") : decideCorrection(id, "REJECTED")}>Confirm {kind === "entry" ? "rejection" : "denial"}</button>
        <button type="button" className="button--secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
      </div>
    </div>;
  }

  return (
    <section aria-labelledby="approvals-heading" className="card approval-queue">
      <h2 id="approvals-heading" tabIndex={-1}>Pending Time Approvals</h2>
      <p className="approval-queue__intro">{user?.role === "ADMIN" ? "Every student's time. Any admin or any of a student's supervisors can approve." : "Time from every student assigned to you. Any of a student's supervisors can approve."}</p>
      {students.length > 1 && <PersonSearch label="Filter by student" people={students} value={studentFilter} onChange={setStudentFilter} multiple />}
      <h3>Clock entries</h3>
      <div className="table-scroll" role="region" aria-label="Time entries awaiting approval" tabIndex={0}>
        <table>
          <caption className="sr-only">Time entries awaiting approval</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Clock In</th><th scope="col">Clock Out</th><th scope="col">Charge account</th><th scope="col">Waiting</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {shownEntries.length === 0 && <tr><td colSpan={6}>There are no regular time entries waiting for approval.</td></tr>}
            {shownEntries.map((entry) => <tr key={entry.id}>
              <th scope="row">{entry.user.fullName}</th>
              <td>{new Date(entry.clockIn).toLocaleString()}</td>
              <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
              <td title={entry.chargeAccount?.name}>{entry.chargeAccount?.code ?? "Unassigned"}</td>
              <td>{entry.clockOut ? waitingFor(entry.submittedAt) : "Still clocked in"}</td>
              <td>
                <div className="button-row">
                  <button type="button" onClick={() => decideEntry(entry.id, "APPROVED")} className="approval-queue__approve" aria-label={`Approve time entry for ${entry.user.fullName}`}>Approve</button>
                  <button type="button" onClick={() => openReject("entry", entry.id)} className="button--danger approval-queue__reject" aria-label={`Reject time entry for ${entry.user.fullName}`}>Reject</button>
                </div>
                {rejectionForm("entry", entry.id)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <h3>Missed punches &amp; correction requests</h3>
      <div className="table-scroll" role="region" aria-label="Time correction requests awaiting approval" tabIndex={0}>
        <table>
          <caption className="sr-only">Student time correction requests awaiting approval</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Current shift</th><th scope="col">Requested shift</th><th scope="col">Student reason</th><th scope="col">Waiting</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {shownCorrections.length === 0 && <tr><td colSpan={6}>There are no missed-punch or correction requests waiting for approval.</td></tr>}
            {shownCorrections.map((request) => <tr key={request.id}>
              <th scope="row">{request.user.fullName}</th>
              <td>{request.timeEntryId && request.currentClockIn ? <>{new Date(request.currentClockIn).toLocaleString()}<br />{request.currentClockOut ? new Date(request.currentClockOut).toLocaleString() : "No clock-out"}</> : "New missed shift"}</td>
              <td>{new Date(request.requestedClockIn).toLocaleString()}<br />{new Date(request.requestedClockOut).toLocaleString()}</td>
              <td>{request.reason}</td>
              <td>{waitingFor(request.submittedAt)}</td>
              <td>
                <div className="button-row">
                  <button type="button" onClick={() => decideCorrection(request.id, "APPROVED")} className="approval-queue__approve" aria-label={`Approve time correction for ${request.user.fullName}`}>Approve change</button>
                  <button type="button" onClick={() => openReject("correction", request.id)} className="button--danger approval-queue__reject" aria-label={`Deny time correction for ${request.user.fullName}`}>Deny</button>
                </div>
                {rejectionForm("correction", request.id)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p role="status" aria-live="polite" className="status-message">{message}</p>
      {attribution && <p className="talon-action-attribution">{attribution.action} <span className="talon-action-signature">{attribution.name}</span></p>}
    </section>
  );
}
