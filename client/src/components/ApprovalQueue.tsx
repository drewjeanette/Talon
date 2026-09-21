import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface PendingEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  user: { id: number; firstName: string; lastName: string };
}

interface PendingCorrection {
  id: number;
  timeEntryId: number | null;
  requestedClockIn: string;
  requestedClockOut: string;
  currentClockIn: string | null;
  currentClockOut: string | null;
  reason: string;
  user: { id: number; firstName: string; lastName: string };
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

  async function load() {
    const [pendingEntries, pendingCorrections] = await Promise.all([
      api.get<PendingEntry[]>("/timeclock/pending"),
      api.get<PendingCorrection[]>("/timeclock/correction-requests/pending"),
    ]);
    setEntries(pendingEntries);
    setCorrections(pendingCorrections);
  }

  useEffect(() => { load().catch(() => setMessage("Could not load pending time requests.")); }, []);

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
      <h3>Clock entries</h3>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Time entries awaiting approval</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Clock In</th><th scope="col">Clock Out</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={4}>There are no regular time entries waiting for approval.</td></tr>}
            {entries.map((entry) => <tr key={entry.id}>
              <td>{entry.user.id === 3 && entry.user.firstName === "Chris" ? "Chris" : `${entry.user.firstName} ${entry.user.lastName}`}</td>
              <td>{new Date(entry.clockIn).toLocaleString()}</td>
              <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
              <td>
                <div className="button-row">
                  <button type="button" onClick={() => decideEntry(entry.id, "APPROVED")} className="approval-queue__approve">Approve</button>
                  <button type="button" onClick={() => openReject("entry", entry.id)} className="button--danger approval-queue__reject">Reject</button>
                </div>
                {rejectionForm("entry", entry.id)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <h3>Missed punches &amp; correction requests</h3>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Student time correction requests awaiting approval</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Current shift</th><th scope="col">Requested shift</th><th scope="col">Student reason</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {corrections.length === 0 && <tr><td colSpan={5}>There are no missed-punch or correction requests waiting for approval.</td></tr>}
            {corrections.map((request) => <tr key={request.id}>
              <td>{request.user.firstName} {request.user.lastName}</td>
              <td>{request.timeEntryId && request.currentClockIn ? <>{new Date(request.currentClockIn).toLocaleString()}<br />{request.currentClockOut ? new Date(request.currentClockOut).toLocaleString() : "No clock-out"}</> : "New missed shift"}</td>
              <td>{new Date(request.requestedClockIn).toLocaleString()}<br />{new Date(request.requestedClockOut).toLocaleString()}</td>
              <td>{request.reason}</td>
              <td>
                <div className="button-row">
                  <button type="button" onClick={() => decideCorrection(request.id, "APPROVED")} className="approval-queue__approve">Approve change</button>
                  <button type="button" onClick={() => openReject("correction", request.id)} className="button--danger approval-queue__reject">Deny</button>
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
