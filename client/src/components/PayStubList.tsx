import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { downloadBlob } from "../lib/work";

interface PayStub {
  id: number;
  regularHours: string;
  overtimeHours: string;
  totalHours: string;
  hourlyRate: string | null;
  grossPay: string;
  status: "DRAFT" | "FINALIZED" | "PAID";
  payPeriod: { startDate: string; endDate: string; payDate: string };
}

const date = (value: string) => new Date(value).toLocaleDateString();

/** The signed-in person's own pay stubs: a plain list to view or download. No review actions. */
export function PayStubList() {
  const [stubs, setStubs] = useState<PayStub[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<PayStub[]>("/payroll/my-stubs").then(setStubs).catch(() => setMessage("Could not load your pay stubs."));
  }, []);

  async function download(stub: PayStub) {
    try {
      const blob = await api.get<Blob>(`/payroll/stubs/${stub.id}/pdf`);
      downloadBlob(blob, `paystub-${stub.payPeriod.payDate.slice(0, 10)}.pdf`);
      setMessage(`Downloaded the pay stub for ${date(stub.payPeriod.payDate)}.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not download the pay stub.");
    }
  }

  return (
    <section aria-labelledby="paystubs-heading" className="card pay-stubs">
      <h2 id="paystubs-heading" tabIndex={-1}>My Pay Stubs</h2>
      <div className="table-scroll" role="region" aria-label="Pay stub history" tabIndex={0}>
        <table>
          <caption className="sr-only">Pay stub history</caption>
          <thead>
            <tr>
              <th scope="col">Pay period</th>
              <th scope="col">Pay date</th>
              <th scope="col">Rate</th>
              <th scope="col" className="numeric">Regular hrs</th>
              <th scope="col" className="numeric">Overtime hrs</th>
              <th scope="col" className="numeric">Gross pay</th>
              <th scope="col">Status</th>
              <th scope="col">Download</th>
            </tr>
          </thead>
          <tbody>
            {stubs.length === 0 && (
              <tr>
                <td colSpan={8}>No pay stubs are available yet.</td>
              </tr>
            )}
            {stubs.map((stub) => (
              <tr key={stub.id}>
                <td>{date(stub.payPeriod.startDate)} – {date(stub.payPeriod.endDate)}</td>
                <td>{date(stub.payPeriod.payDate)}</td>
                <td>{stub.hourlyRate === null ? "Salary" : `$${stub.hourlyRate}`}</td>
                <td className="numeric">{stub.regularHours}</td>
                <td className="numeric">{stub.overtimeHours}</td>
                <td className="numeric">${stub.grossPay}</td>
                <td>{stub.status}</td>
                <td>
                  <button type="button" className="pay-stubs__download" onClick={() => download(stub)} aria-label={`Download PDF of pay stub paid ${date(stub.payPeriod.payDate)}`}>Download PDF</button>
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
