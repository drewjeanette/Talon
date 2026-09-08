import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface PayPeriod {
  id: number;
  type: "BIWEEKLY" | "MONTHLY";
  startDate: string;
  endDate: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportGenerator() {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [payPeriodId, setPayPeriodId] = useState<string>("");
  const [scope, setScope] = useState<"DEPARTMENT" | "COLLEGE" | "ALL">("DEPARTMENT");
  const [message, setMessage] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    api.get<PayPeriod[]>("/payroll/periods").then(setPeriods).catch(() => setMessage("Could not load pay periods."));
  }, []);

  async function handleGenerate() {
    if (!payPeriodId) {
      setMessage("Choose a pay period first.");
      return;
    }
    setMessage(null);
    try {
      const params = new URLSearchParams({ payPeriodId, format: "csv" });
      if (isAdmin) params.set("scope", scope);
      const blob = await api.get<Blob>(`/reports/payroll?${params.toString()}`);
      downloadBlob(blob, `payroll-report-${payPeriodId}.csv`);
      setMessage("Report downloaded.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not generate report.");
    }
  }

  return (
    <section aria-labelledby="report-heading" className="card">
      <h2 id="report-heading">Auto-Generate Payroll Report</h2>
      <div className="form-row">
        <label htmlFor="pay-period-select">Pay period</label>
        <select id="pay-period-select" value={payPeriodId} onChange={(e) => setPayPeriodId(e.target.value)}>
          <option value="">Select a pay period</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.type} · {new Date(p.startDate).toLocaleDateString()} - {new Date(p.endDate).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>
      {isAdmin && (
        <div className="form-row">
          <label htmlFor="scope-select">Scope</label>
          <select id="scope-select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="DEPARTMENT">Department</option>
            <option value="COLLEGE">College</option>
            <option value="ALL">All (university-wide)</option>
          </select>
        </div>
      )}
      {!isAdmin && <p>Scoped automatically to your department.</p>}
      <button type="button" onClick={handleGenerate}>
        Generate CSV
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
