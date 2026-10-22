import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { downloadBlob, notifyWorkChanged } from "../lib/work";
import { PersonSearch } from "./PersonSearch";

interface TeamStub {
  id: number;
  employeeId: number;
  employeeName: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  department: string | null;
  chargeAccount: string | null;
  hourlyRate: string | null;
  regularHours: string;
  overtimeHours: string;
  totalHours: string;
  regularPay: string;
  overtimePay: string;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: string | null;
  reviewReason: string | null;
  flag: { note: string; open: boolean; flaggedBy: string | null; resolution: string | null } | null;
  payPeriod: { id: number; startDate: string; endDate: string; payDate: string };
}

type Form = { kind: "reject" | "flag" | "resolve"; id: number } | null;

const FORM_COPY = {
  reject: { label: "Reason for rejection", submit: "Submit rejection", placeholder: "Explain what needs to be corrected." },
  flag: { label: "Question about this pay stub", submit: "Send question", placeholder: "Example: Overtime looks high. Was a shift entered twice?" },
  resolve: { label: "Answer", submit: "Mark answered", placeholder: "Explain what was found or fixed." },
} as const;

const date = (value: string) => new Date(value).toLocaleDateString();

/** Student pay stubs for review: approve one at a time or several at once. */
export function TeamPayStubStatus() {
  const [stubs, setStubs] = useState<TeamStub[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<Form>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [people, setPeople] = useState<number[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [showDone, setShowDone] = useState(false);

  async function load() {
    const data = await api.get<TeamStub[]>("/payroll/team-stubs");
    setStubs(data);
    setSelected((ids) => ids.filter((id) => data.some((stub) => stub.id === id && stub.reviewStatus === "PENDING")));
  }

  useEffect(() => {
    load().catch(() => setMessage("Could not load student pay stubs."));
  }, []);

  const periods = useMemo(() => {
    const map = new Map<number, TeamStub["payPeriod"]>();
    for (const stub of stubs) map.set(stub.payPeriod.id, stub.payPeriod);
    return [...map.values()];
  }, [stubs]);
  const students = useMemo(() => {
    const map = new Map<number, { id: number; firstName: string; lastName: string; preferredName: string | null; detail: string | null }>();
    for (const stub of stubs) map.set(stub.employeeId, { id: stub.employeeId, firstName: stub.firstName, lastName: stub.lastName, preferredName: stub.preferredName, detail: stub.department });
    return [...map.values()];
  }, [stubs]);
  const shown = stubs.filter((stub) =>
    (showDone || stub.reviewStatus === "PENDING" || stub.flag?.open) &&
    (!people.length || people.includes(stub.employeeId)) &&
    (!periodId || stub.payPeriod.id === Number(periodId))
  );
  const pendingShown = shown.filter((stub) => stub.reviewStatus === "PENDING");
  const allSelected = pendingShown.length > 0 && pendingShown.every((stub) => selected.includes(stub.id));

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setForm(null);
      setText("");
      await load();
      notifyWorkChanged();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save the pay stub review.");
    } finally {
      setBusy(false);
    }
  }

  function approve(stub: TeamStub) {
    return run(() => api.patch(`/payroll/team-stubs/${stub.id}/review`, { status: "APPROVED" }), `Approved the pay stub for ${stub.employeeName}.`);
  }

  function approveSelected() {
    const count = selected.length;
    return run(() => api.post("/payroll/team-stubs/approve", { ids: selected }), `Approved ${count} pay stub${count === 1 ? "" : "s"}.`).then(() => setSelected([]));
  }

  function submitForm(stub: TeamStub) {
    if (!form) return;
    if (text.trim().length < 3) {
      setMessage(`${FORM_COPY[form.kind].label} needs at least a few words.`);
      return;
    }
    const body = text.trim();
    if (form.kind === "reject") return run(() => api.patch(`/payroll/team-stubs/${stub.id}/review`, { status: "REJECTED", reason: body }), `Rejected the pay stub for ${stub.employeeName}.`);
    if (form.kind === "flag") return run(() => api.post(`/payroll/stubs/${stub.id}/flag`, { note: body }), `Question sent about ${stub.employeeName}'s pay stub.`);
    return run(() => api.post(`/payroll/stubs/${stub.id}/resolve-flag`, { resolution: body }), `Marked the question on ${stub.employeeName}'s pay stub as answered.`);
  }

  async function downloadPdf(stub: TeamStub) {
    try {
      const blob = await api.get<Blob>(`/payroll/stubs/${stub.id}/pdf`);
      downloadBlob(blob, `paystub-${stub.lastName.toLowerCase()}-${stub.payPeriod.payDate.slice(0, 10)}.pdf`);
      setMessage(`Downloaded ${stub.employeeName}'s pay stub.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not download the pay stub.");
    }
  }

  function openForm(kind: NonNullable<Form>["kind"], id: number) {
    setForm({ kind, id });
    setText("");
    setMessage("");
  }

  return (
    <section className="card team-pay-stubs" aria-labelledby="team-paystubs-heading">
      <h2 id="team-paystubs-heading" tabIndex={-1}>Student Pay Stub Review</h2>
      <div className="stub-review__filters">
        <PersonSearch label="Students" people={students} value={people} onChange={setPeople} multiple />
        <div className="form-row">
          <label htmlFor="stub-review-period">Pay period</label>
          <select id="stub-review-period" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
            <option value="">All pay periods</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{date(period.startDate)} – {date(period.endDate)}</option>)}
          </select>
        </div>
        <label className="stub-review__toggle"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} /> Show reviewed stubs</label>
      </div>
      <div className="stub-review__batch">
        <button type="button" className="approval-queue__approve" onClick={approveSelected} disabled={busy || selected.length === 0}>Approve selected ({selected.length})</button>
      </div>
      <div className="table-scroll" role="region" aria-label="Student pay stub review" tabIndex={0}>
        <table>
          <caption className="sr-only">Student pay stubs. Select pending stubs to approve them together.</caption>
          <thead>
            <tr>
              <th scope="col"><input type="checkbox" aria-label="Select all pending pay stubs shown" checked={allSelected} disabled={pendingShown.length === 0} onChange={() => setSelected(allSelected ? [] : pendingShown.map((stub) => stub.id))} /></th>
              <th scope="col">Student</th>
              <th scope="col">Pay period</th>
              <th scope="col">Rate</th>
              <th scope="col" className="numeric">Reg hrs</th>
              <th scope="col" className="numeric">Reg pay</th>
              <th scope="col" className="numeric">OT hrs</th>
              <th scope="col" className="numeric">OT pay</th>
              <th scope="col" className="numeric">Gross pay</th>
              <th scope="col">Review</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={11}>{stubs.length ? "No pay stubs match. Every stub shown here has been reviewed." : "No student pay stubs are available yet."}</td></tr>}
            {shown.map((stub) => (
              <tr key={stub.id}>
                <td>{stub.reviewStatus === "PENDING" && <input type="checkbox" checked={selected.includes(stub.id)} onChange={() => setSelected((ids) => (ids.includes(stub.id) ? ids.filter((id) => id !== stub.id) : [...ids, stub.id]))} aria-label={`Select pay stub for ${stub.employeeName}`} />}</td>
                <th scope="row">
                  {stub.employeeName}
                  <small className="stub-review__meta">{[stub.department, stub.chargeAccount].filter(Boolean).join(" · ")}</small>
                  {stub.flag && (
                    <small className={`stub-flag${stub.flag.open ? " stub-flag--open" : ""}`}>
                      <strong>{stub.flag.open ? "Question" : "Answered"}{stub.flag.flaggedBy ? ` from ${stub.flag.flaggedBy}` : ""}:</strong> {stub.flag.note}
                      {stub.flag.resolution && <> <strong>Answer:</strong> {stub.flag.resolution}</>}
                    </small>
                  )}
                </th>
                <td>{date(stub.payPeriod.startDate)} – {date(stub.payPeriod.endDate)}<small className="stub-review__meta">Pay date {date(stub.payPeriod.payDate)}</small></td>
                <td>{stub.hourlyRate === null ? "Salary" : `$${stub.hourlyRate}`}</td>
                <td className="numeric">{stub.regularHours}</td>
                <td className="numeric">${stub.regularPay}</td>
                <td className="numeric">{stub.overtimeHours}</td>
                <td className="numeric">${stub.overtimePay}</td>
                <td className="numeric">${stub.grossPay}</td>
                <td className="review-status">
                  <strong className={`decision ${stub.reviewStatus === "APPROVED" ? "approved" : stub.reviewStatus === "REJECTED" ? "rejected" : ""}`}>{stub.reviewStatus}</strong>
                  {stub.reviewedBy && <small className="stub-review-reason">by <span className="talon-action-signature">{stub.reviewedBy}</span></small>}
                  {stub.reviewReason && <small className="stub-review-reason">{stub.reviewReason}</small>}
                </td>
                <td>
                  <div className="button-row stub-review__actions">
                    {stub.reviewStatus === "PENDING" && <>
                      <button type="button" className="approval-queue__approve" disabled={busy} onClick={() => approve(stub)} aria-label={`Approve pay stub for ${stub.employeeName}`}>Approve</button>
                      <button type="button" className="button--danger" disabled={busy} onClick={() => openForm("reject", stub.id)} aria-label={`Reject pay stub for ${stub.employeeName}`}>Reject</button>
                    </>}
                    {stub.flag?.open
                      ? <button type="button" className="button--secondary" disabled={busy} onClick={() => openForm("resolve", stub.id)} aria-label={`Answer question on ${stub.employeeName}'s pay stub`}>Answer question</button>
                      : <button type="button" className="button--secondary" disabled={busy} onClick={() => openForm("flag", stub.id)} aria-label={`Flag a question on ${stub.employeeName}'s pay stub`}>Flag question</button>}
                    <button type="button" className="button--secondary" onClick={() => downloadPdf(stub)} aria-label={`Download PDF of ${stub.employeeName}'s pay stub`}>PDF</button>
                  </div>
                  {form?.id === stub.id && (
                    <div className="stub-rejection-form">
                      <label htmlFor={`stub-form-${stub.id}`}>{FORM_COPY[form.kind].label}</label>
                      <textarea id={`stub-form-${stub.id}`} value={text} maxLength={500} autoFocus onChange={(event) => setText(event.target.value)} placeholder={FORM_COPY[form.kind].placeholder} />
                      <div className="button-row">
                        <button type="button" className={form.kind === "reject" ? "button--danger" : undefined} disabled={busy} onClick={() => submitForm(stub)}>{FORM_COPY[form.kind].submit}</button>
                        <button type="button" className="button--secondary" onClick={() => setForm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="status-message" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
