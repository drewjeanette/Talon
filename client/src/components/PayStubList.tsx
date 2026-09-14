import { useEffect, useState } from "react";
import { api } from "../api/client";

interface PayStub {
  id: number;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

export function PayStubList() {
  const [stubs, setStubs] = useState<PayStub[]>([]);

  useEffect(() => {
    api.get<PayStub[]>("/payroll/my-stubs").then(setStubs);
  }, []);

  return (
    <section aria-labelledby="paystubs-heading" className="card pay-stubs">
      <h2 id="paystubs-heading">My Pay Stubs</h2>
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
            </tr>
          </thead>
          <tbody>
            {stubs.length === 0 && (
              <tr>
                <td colSpan={6}>No pay stubs yet.</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
