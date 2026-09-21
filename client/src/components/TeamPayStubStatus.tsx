import { useEffect, useState } from "react";
import { api } from "../api/client";

interface TeamStub {
  id: number;
  employeeName: string;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

export function TeamPayStubStatus() {
  const [stubs, setStubs] = useState<TeamStub[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<TeamStub[]>("/payroll/team-stubs").then(setStubs).catch(() => setError("Could not load employee pay-stub statuses."));
  }, []);

  return (
    <section className="card team-pay-stubs" aria-labelledby="team-paystubs-heading">
      <h2 id="team-paystubs-heading" tabIndex={-1}>Employee Pay-Stub Statuses</h2>
      <div className="table-scroll">
        <table>
          <thead><tr><th scope="col">Employee</th><th scope="col">Pay period</th><th scope="col">Pay date</th><th scope="col">Hours</th><th scope="col">Gross pay</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {stubs.length === 0 && <tr><td colSpan={6}>No employee pay stubs are available yet.</td></tr>}
            {stubs.map((stub) => <tr key={stub.id}>
              <td>{stub.employeeName}</td>
              <td>{new Date(stub.payPeriod.startDate).toLocaleDateString()} – {new Date(stub.payPeriod.endDate).toLocaleDateString()}</td>
              <td>{new Date(stub.payPeriod.payDate).toLocaleDateString()}</td>
              <td>{stub.regularHours} regular / {stub.overtimeHours} overtime</td>
              <td>${stub.grossPay}</td>
              <td>{stub.status}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {error && <p className="status-message" role="status">{error}</p>}
    </section>
  );
}
