import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface PayPeriod {
  id: number;
  type: "BIWEEKLY" | "MONTHLY";
  startDate: string;
  endDate: string;
  payDate: string;
  status: "OPEN" | "PROCESSING" | "CLOSED";
}

export function PayPeriodManager() {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [type, setType] = useState<"BIWEEKLY" | "MONTHLY">("BIWEEKLY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [payDate, setPayDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await api.get<PayPeriod[]>("/payroll/periods");
    setPeriods(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post("/payroll/periods", {
        type,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        payDate: new Date(payDate).toISOString(),
      });
      setMessage("Pay period created.");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not create pay period.");
    }
  }

  async function handleGenerate(id: number) {
    setMessage(null);
    try {
      const result = await api.post<{ generated: number }>(`/payroll/periods/${id}/generate`);
      setMessage(`Generated ${result.generated} pay stubs.`);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not generate pay stubs.");
    }
  }

  async function handleFinalize(id: number) {
    setMessage(null);
    try {
      await api.post(`/payroll/periods/${id}/finalize`);
      setMessage("Pay period finalized.");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not finalize pay period.");
    }
  }

  return (
    <section aria-labelledby="pay-period-heading" className="card">
      <h2 id="pay-period-heading">Pay Periods</h2>
      <form onSubmit={handleCreate} className="form-row-group">
        <div className="form-row">
          <label htmlFor="period-type">Type</label>
          <select id="period-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="BIWEEKLY">Biweekly (students)</option>
            <option value="MONTHLY">Monthly (faculty)</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="start-date">Start date</label>
          <input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="end-date">End date</label>
          <input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="pay-date">Pay date</label>
          <input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
        </div>
        <button type="submit">Create pay period</button>
      </form>

      <table>
        <caption className="sr-only">Existing pay periods</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Range</th>
            <th scope="col">Pay date</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id}>
              <td>{p.type}</td>
              <td>
                {new Date(p.startDate).toLocaleDateString()} - {new Date(p.endDate).toLocaleDateString()}
              </td>
              <td>{new Date(p.payDate).toLocaleDateString()}</td>
              <td>{p.status}</td>
              <td className="button-row">
                <button type="button" onClick={() => handleGenerate(p.id)} disabled={p.status === "CLOSED"}>
                  Generate stubs
                </button>
                <button type="button" onClick={() => handleFinalize(p.id)} disabled={p.status !== "PROCESSING"}>
                  Finalize
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
