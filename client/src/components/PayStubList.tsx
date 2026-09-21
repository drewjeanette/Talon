import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface PayStub {
  id: number;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
  processedBy?: string | null;
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

export function PayStubList() {
  const { user } = useAuth();
  const [stubs, setStubs] = useState<PayStub[]>([]);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    api.get<PayStub[]>("/payroll/my-stubs").then(setStubs);
  }, []);

  return (
    <section aria-labelledby="paystubs-heading" className="card pay-stubs">
      <h2 id="paystubs-heading" tabIndex={-1}>My Pay Stubs</h2>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Pay stub history</caption>
          <thead>
            <tr>
              <th scope="col">Pay period</th>
              <th scope="col">Pay date</th>
              <th scope="col">Regular hrs</th>
              <th scope="col">Overtime hrs</th>
              <th scope="col">Gross pay</th>
              <th scope="col">Status</th>
              <th scope="col">Processed By</th>
            </tr>
          </thead>
          <tbody>
            {stubs.length === 0 && (
              <tr>
                <td colSpan={7}>No pay stubs are available yet.</td>
              </tr>
            )}
            {stubs.map((s) => (
              <tr key={s.id}>
                <td>
                  {new Date(s.payPeriod.startDate).toLocaleDateString()} - {new Date(s.payPeriod.endDate).toLocaleDateString()}
                </td>
                <td>{new Date(s.payPeriod.payDate).toLocaleDateString()}</td>
                <td>{s.regularHours}</td>
                <td>{s.overtimeHours}</td>
                <td>${s.grossPay}</td>
                <td>{s.status}</td>
                <td>{s.processedBy ? <span className="talon-action-signature">{s.processedBy}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {user?.role === "SUPERVISOR" && <>
        <button type="button" className="supervisor-stubs-reviewed" onClick={() => setReviewed(true)} disabled={reviewed}>{reviewed ? "Pay-stub review complete" : "Mark pay-stub review complete"}</button>
        {reviewed && <p className="talon-action-attribution">Reviewed by <span className="talon-action-signature">{user.firstName}</span></p>}
      </>}
    </section>
  );
}
