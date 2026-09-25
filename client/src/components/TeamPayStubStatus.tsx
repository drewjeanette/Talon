import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface TeamStub {
  id: number;
  employeeName: string;
  hourlyRate: string | null;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: string | null;
  reviewReason: string | null;
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

export function TeamPayStubStatus() {
  const [stubs, setStubs] = useState<TeamStub[]>([]);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    setStubs(await api.get<TeamStub[]>("/payroll/team-stubs"));
  }

  useEffect(() => {
    load().catch(() => setError("Could not load student pay-stub reviews."));
  }, []);

  async function decide(id: number, status: "APPROVED" | "REJECTED") {
    if (status === "REJECTED" && reason.trim().length < 3) {
      setError("Enter a reason before rejecting this pay stub.");
      return;
    }
    setBusy(id);
    setError("");
    try {
      await api.patch(`/payroll/team-stubs/${id}/review`, { status, reason: status === "REJECTED" ? reason.trim() : undefined });
      setRejecting(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the pay-stub review.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card team-pay-stubs" aria-labelledby="team-paystubs-heading">
      <h2 id="team-paystubs-heading" tabIndex={-1}>Student Pay Stub Review</h2>
      <div className="table-scroll" role="region" aria-label="Student pay stub review" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Student</th><th scope="col">Pay</th><th scope="col">Gross Pay</th><th scope="col">Pay Period</th><th scope="col">Pay Date</th><th scope="col">Hrs Worked</th><th scope="col">Status</th><th scope="col">Reviewed By</th></tr></thead>
          <tbody>
            {stubs.length === 0 && <tr><td colSpan={8}>No student pay stubs are available yet.</td></tr>}
            {stubs.map((stub) => <tr key={stub.id}>
              <td>{stub.employeeName}</td>
              <td>{stub.hourlyRate === null ? "—" : `$${stub.hourlyRate}`}</td>
              <td>${stub.grossPay}</td>
              <td>{new Date(stub.payPeriod.startDate).toLocaleDateString()} – {new Date(stub.payPeriod.endDate).toLocaleDateString()}</td>
              <td>{new Date(stub.payPeriod.payDate).toLocaleDateString()}</td>
              <td>{(Number(stub.regularHours) + Number(stub.overtimeHours)).toFixed(2)}</td>
              <td className="review-status">
                {stub.reviewStatus === "PENDING" ? <>
                  <div className="button-row">
                    <button type="button" className="approval-queue__approve" disabled={busy === stub.id} onClick={() => decide(stub.id, "APPROVED")} aria-label={`Approve pay stub for ${stub.employeeName}`}>Approve</button>
                    <button type="button" className="button--danger" disabled={busy === stub.id} onClick={() => { setRejecting(stub.id); setReason(""); }} aria-label={`Reject pay stub for ${stub.employeeName}`}>Reject</button>
                  </div>
                  {rejecting === stub.id && <div className="stub-rejection-form">
                    <label htmlFor={`stub-reason-${stub.id}`}>Reason for rejection</label>
                    <textarea id={`stub-reason-${stub.id}`} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Explain what needs to be corrected." />
                    <div className="button-row"><button type="button" className="button--danger" onClick={() => decide(stub.id, "REJECTED")}>Submit rejection</button><button type="button" onClick={() => setRejecting(null)}>Cancel</button></div>
                  </div>}
                </> : <><strong className={`decision ${stub.reviewStatus === "APPROVED" ? "approved" : "rejected"}`}>{stub.reviewStatus}</strong>{stub.reviewReason && <small className="stub-review-reason">{stub.reviewReason}</small>}</>}
              </td>
              <td>{stub.reviewedBy ? <span className="talon-action-signature">{stub.reviewedBy}</span> : "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {error && <p className="status-message" role="status">{error}</p>}
    </section>
  );
}
