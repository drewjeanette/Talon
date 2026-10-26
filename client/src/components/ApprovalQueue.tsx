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
  chargeAccount: { id: number; code: string; name: string } | null;
  jobTitle: string | null;
  user: Person;
}

interface ChargeAccount { id: number; code: string; name: string; isActive: boolean }

interface PendingCorrection {
  id: number;
  timeEntryId: number | null;
  requestedClockIn: string;
  requestedClockOut: string;
  currentClockIn: string | null;
  currentClockOut: string | null;
  reason: string;
  submittedAt: string;
  jobTitle: string | null;
  user: Person;
}

type RejectTarget = { kind: "entry" | "correction"; id: number } | null;

interface ReviewedCorrection extends PendingCorrection {
  status: "APPROVED" | "REJECTED";
  reviewerName: string | null;
  reviewerReason: string | null;
  reviewedAt: string | null;
}

export function ApprovalQueue() {
  const { user } = useAuth();
  const showReviewed = user?.role === "ADMIN";
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [corrections, setCorrections] = useState<PendingCorrection[]>([]);
  const [reviewedCorrections, setReviewedCorrections] = useState<ReviewedCorrection[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<{ action: string; name: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [studentFilter, setStudentFilter] = useState<number[]>([]);
  const [accounts, setAccounts] = useState<ChargeAccount[]>([]);
  const [moving, setMoving] = useState<{ entryId: number; accountId: string } | null>(null);

  async function load() {
    const [pendingEntries, pendingCorrections, reviewed] = await Promise.all([
      api.get<PendingEntry[]>("/timeclock/pending"),
      api.get<PendingCorrection[]>("/timeclock/correction-requests/pending"),
      showReviewed ? api.get<ReviewedCorrection[]>("/timeclock/correction-requests/reviewed") : Promise.resolve([]),
    ]);
    setEntries(pendingEntries);
    setCorrections(pendingCorrections);
    setReviewedCorrections(reviewed);
  }

  useEffect(() => {
    load().catch(() => setMessage("Could not load pending time requests."));
    api.get<ChargeAccount[]>("/org/charge-accounts").then((data) => setAccounts(data.filter((account) => account.isActive))).catch(() => setAccounts([]));
  }, []);

  async function moveAccount(entry: PendingEntry) {
    if (!moving?.accountId) {
      setMessage("Choose the charge account for this shift.");
      return;
    }
    setMessage(null);
    try {
      const result = await api.patch<{ chargeAccount: { code: string } }>(`/timeclock/${entry.id}/charge-account`, { chargeAccountId: Number(moving.accountId) });
      setMessage(`Shift for ${entry.user.fullName} moved to ${result.chargeAccount.code}.`);
      setMoving(null);
      await load();
      notifyWorkChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not move the shift.");
    }
  }

  const students = useMemo(() => {
    const map = new Map<number, Person>();
    for (const item of [...entries, ...corrections, ...reviewedCorrections]) map.set(item.user.id, item.user);
    return [...map.values()];
  }, [entries, corrections, reviewedCorrections]);
  const showEntry = (item: { user: Person }) => !studentFilter.length || studentFilter.includes(item.user.id);
  const shownEntries = entries.filter(showEntry);
  const shownCorrections = corrections.filter(showEntry);
  const shownReviewedCorrections = reviewedCorrections.filter(showEntry);
  const splitStudents = studentFilter.length === 2
    ? studentFilter.map((id) => students.find((student) => student.id === id)).filter((student): student is Person => Boolean(student))
    : [];
  const showSplitReview = splitStudents.length === 2;

  function openReject(kind: "entry" | "correction", id: number) {
    setRejectTarget({ kind, id });
    setRejectionReason("");
    setMessage(null);
  }

  async function decideEntry(id: number, status: "APPROVED" | "REJECTED") {
    if (status === "REJECTED" && rejectionReason.trim().length < 3) {
      setMessage("Enter a reason before denying the time entry.");
      return;
    }
    setMessage(null);
    try {
      await api.patch(`/timeclock/${id}/decision`, {
        status,
        ...(status === "REJECTED" ? { rejectionReason: rejectionReason.trim() } : {}),
      });
      setMessage(`Time entry ${status === "APPROVED" ? "approved" : "denied"}.`);
      setAttribution({ action: status === "APPROVED" ? "Approved by" : "Denied by", name: user?.firstName ?? "Supervisor" });
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
      <label htmlFor={`reject-${kind}-${id}`}>Reason for denial</label>
      <textarea id={`reject-${kind}-${id}`} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} autoFocus required />
      <div className="button-row">
        <button type="button" className="button--danger" onClick={() => kind === "entry" ? decideEntry(id, "REJECTED") : decideCorrection(id, "REJECTED")}>Confirm denial</button>
        <button type="button" className="button--secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
      </div>
    </div>;
  }

  function statusFor(submittedAt: string | null, inProgress = false) {
    return inProgress ? "In progress" : `Pending ${waitingFor(submittedAt)}`;
  }

  function entryActions(entry: PendingEntry) {
    return <>
      <div className="button-row approval-queue__actions">
        <button type="button" onClick={() => decideEntry(entry.id, "APPROVED")} className="approval-queue__approve" aria-label={`Approve time entry for ${entry.user.fullName}`}>Approve</button>
        <button type="button" onClick={() => openReject("entry", entry.id)} className="button--danger approval-queue__reject" aria-label={`Deny time entry for ${entry.user.fullName}`}>Deny</button>
      </div>
      {rejectionForm("entry", entry.id)}
    </>;
  }

  function correctionActions(request: PendingCorrection) {
    return <>
      <div className="button-row approval-queue__actions">
        <button type="button" onClick={() => decideCorrection(request.id, "APPROVED")} className="approval-queue__approve" aria-label={`Approve time correction for ${request.user.fullName}`}>Approve</button>
        <button type="button" onClick={() => openReject("correction", request.id)} className="button--danger approval-queue__reject" aria-label={`Deny time correction for ${request.user.fullName}`}>Deny</button>
      </div>
      {rejectionForm("correction", request.id)}
    </>;
  }

  function entryChargeAccount(entry: PendingEntry) {
    return <td>
      <span title={entry.chargeAccount?.name}>{entry.chargeAccount?.code ?? "Unassigned"}</span>
      {entry.jobTitle && <small className="approval-queue__job">{entry.jobTitle}</small>}
      {moving?.entryId === entry.id ? (
        <div className="approval-queue__move">
          <label htmlFor={`move-account-${entry.id}`}>Charge this shift to</label>
          <select id={`move-account-${entry.id}`} value={moving.accountId} onChange={(event) => setMoving({ entryId: entry.id, accountId: event.target.value })}>
            <option value="">Choose an account</option>
            {accounts.filter((account) => account.id !== entry.chargeAccount?.id).map((account) => <option key={account.id} value={account.id}>{account.code} – {account.name}</option>)}
          </select>
          <div className="button-row">
            <button type="button" onClick={() => moveAccount(entry)}>Move shift</button>
            <button type="button" className="button--secondary" onClick={() => setMoving(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="button--secondary approval-queue__change" onClick={() => setMoving({ entryId: entry.id, accountId: "" })} aria-label={`Change charge account for ${entry.user.fullName}'s shift`}>Change account</button>
      )}
    </td>;
  }

  function splitStudentPanel(student: Person) {
    const studentEntries = entries.filter((entry) => entry.user.id === student.id);
    const studentCorrections = corrections.filter((request) => request.user.id === student.id);
    return <section key={student.id} className="approval-split-card" aria-labelledby={`approval-split-${student.id}`}>
      <h3 id={`approval-split-${student.id}`}>{student.fullName}</h3>
      <div className="approval-split-card__section">
        <h4>Clock entries</h4>
        {studentEntries.length === 0 ? <p>No regular time entries waiting.</p> : studentEntries.map((entry) => (
          <article key={entry.id} className="approval-review-item">
            <dl>
              <div><dt>Clock In</dt><dd>{new Date(entry.clockIn).toLocaleString()}</dd></div>
              <div><dt>Clock Out</dt><dd>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</dd></div>
              <div><dt>Student Job Title</dt><dd>{entry.chargeAccount?.code ?? "Unassigned"}{entry.jobTitle ? ` - ${entry.jobTitle}` : ""}</dd></div>
              <div><dt>Status</dt><dd>{statusFor(entry.submittedAt, !entry.clockOut)}</dd></div>
            </dl>
            {entryActions(entry)}
          </article>
        ))}
      </div>
      <div className="approval-split-card__section">
        <h4>Corrections</h4>
        {studentCorrections.length === 0 ? <p>No correction requests waiting.</p> : studentCorrections.map((request) => (
          <article key={request.id} className="approval-review-item">
            <dl>
              <div><dt>Current shift</dt><dd>{request.timeEntryId && request.currentClockIn ? <>{new Date(request.currentClockIn).toLocaleString()}<br />{request.currentClockOut ? new Date(request.currentClockOut).toLocaleString() : "No clock-out"}</> : "New missed shift"}</dd></div>
              <div><dt>Requested shift</dt><dd>{new Date(request.requestedClockIn).toLocaleString()}<br />{new Date(request.requestedClockOut).toLocaleString()}</dd></div>
              <div><dt>Reason</dt><dd>{request.reason}{request.jobTitle ? ` - Job: ${request.jobTitle}` : ""}</dd></div>
              <div><dt>Status</dt><dd>{statusFor(request.submittedAt)}</dd></div>
            </dl>
            {correctionActions(request)}
          </article>
        ))}
      </div>
    </section>;
  }

  return (
    <section aria-labelledby="approvals-heading" className="card approval-queue">
      <h2 id="approvals-heading" tabIndex={-1}>Pending Time Approvals</h2>
      <p className="approval-queue__intro">{user?.role === "ADMIN" ? "Every student's time. Any admin or any of a student's supervisors can approve." : "Time from every student assigned to you. Any of a student's supervisors can approve."}</p>
      {students.length > 1 && <PersonSearch label="Filter by student" people={students} value={studentFilter} onChange={setStudentFilter} multiple />}
      {showSplitReview && (
        <div className="approval-split-view" aria-label="Side-by-side student approval review">
          {splitStudents.map(splitStudentPanel)}
        </div>
      )}
      <h3>Clock entries</h3>
      <div className="table-scroll" role="region" aria-label="Time entries awaiting approval" tabIndex={0}>
        <table>
          <caption className="sr-only">Time entries awaiting approval</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Clock In</th><th scope="col">Clock Out</th><th scope="col">Student Job Title</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {shownEntries.length === 0 && <tr><td colSpan={6}>There are no regular time entries waiting for approval.</td></tr>}
            {shownEntries.map((entry) => <tr key={entry.id}>
              <th scope="row">{entry.user.fullName}</th>
              <td>{new Date(entry.clockIn).toLocaleString()}</td>
              <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
              {entryChargeAccount(entry)}
              <td>{statusFor(entry.submittedAt, !entry.clockOut)}</td>
              <td>{entryActions(entry)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <h3>Missed punches &amp; correction requests</h3>
      <div className="table-scroll" role="region" aria-label="Time correction requests awaiting approval" tabIndex={0}>
        <table>
          <caption className="sr-only">Student time correction requests awaiting approval</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Current shift</th><th scope="col">Requested shift</th><th scope="col">Student reason</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {shownCorrections.length === 0 && <tr><td colSpan={6}>There are no missed-punch or correction requests waiting for approval.</td></tr>}
            {shownCorrections.map((request) => <tr key={request.id}>
              <th scope="row">{request.user.fullName}</th>
              <td>{request.timeEntryId && request.currentClockIn ? <>{new Date(request.currentClockIn).toLocaleString()}<br />{request.currentClockOut ? new Date(request.currentClockOut).toLocaleString() : "No clock-out"}</> : "New missed shift"}</td>
              <td>{new Date(request.requestedClockIn).toLocaleString()}<br />{new Date(request.requestedClockOut).toLocaleString()}</td>
              <td>{request.reason}{request.jobTitle && <small className="approval-queue__job">Job: {request.jobTitle}</small>}</td>
              <td>{statusFor(request.submittedAt)}</td>
              <td>{correctionActions(request)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {showReviewed && <><h3>Reviewed time changes</h3>
      <p>The latest 100 reviewed time-change requests. The reviewer is shown under Actions.</p>
      <div className="table-scroll" role="region" aria-label="Reviewed time change requests" tabIndex={0}>
        <table>
          <caption className="sr-only">Reviewed time change requests</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Requested shift</th><th scope="col">Student reason</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {shownReviewedCorrections.length === 0 && <tr><td colSpan={5}>No reviewed time changes to show.</td></tr>}
            {shownReviewedCorrections.map((request) => <tr key={request.id}>
              <th scope="row">{request.user.fullName}</th>
              <td>{new Date(request.requestedClockIn).toLocaleString()}<br />{new Date(request.requestedClockOut).toLocaleString()}</td>
              <td>{request.reason}{request.jobTitle && <small className="approval-queue__job">Job: {request.jobTitle}</small>}</td>
              <td>{request.status}{request.reviewerReason && <p>Reason: {request.reviewerReason}</p>}</td>
              <td>
                <span>{request.status === "APPROVED" ? "Approved by" : "Denied by"}</span>
                <strong className="approval-queue__reviewer-name">{request.reviewerName ?? "Reviewer unavailable"}</strong>
                {request.reviewedAt && <small className="approval-queue__job">{new Date(request.reviewedAt).toLocaleString()}</small>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      </>}
      <p role="status" aria-live="polite" className="status-message">{message}</p>
      {attribution && <p className="talon-action-attribution">{attribution.action} <span className="talon-action-signature">{attribution.name}</span></p>}
    </section>
  );
}
