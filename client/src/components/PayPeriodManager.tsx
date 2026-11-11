import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { timecardDate } from "../lib/timecards";
import { notifyWorkChanged } from "../lib/work";
import { DateField } from "./DateField";
import { PayrollReport } from "./PayrollReport";

interface PayPeriod {
  id: number;
  type: "BIWEEKLY" | "MONTHLY";
  startDate: string;
  endDate: string;
  payDate: string;
  status: "OPEN" | "PROCESSING" | "CLOSED";
  reportRowCount: number;
}

const dateLabel = (value: string) => timecardDate(Date.parse(value));

export function PayPeriodManager() {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [type, setType] = useState<"BIWEEKLY" | "MONTHLY">("BIWEEKLY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [payDate, setPayDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<PayPeriod | null>(null);
  const [saving, setSaving] = useState(false);
  const editForm = useRef<HTMLFormElement>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const editingId = editing?.id;

  useEffect(() => {
    if (editingId) editForm.current?.querySelector("input")?.focus();
  }, [editingId]);

  function closeEdit() {
    setEditing(null);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.patch<PayPeriod>(`/payroll/periods/${editing.id}`, {
        startDate: editing.startDate,
        endDate: editing.endDate,
        payDate: editing.payDate,
      });
      setPeriods((current) => current.map((period) => period.id === saved.id ? { ...period, ...saved } : period)
        .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id));
      closeEdit();
      setMessage("Pay period updated.");
      notifyWorkChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update pay period.");
    } finally {
      setSaving(false);
    }
  }

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
      notifyWorkChanged();
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
      notifyWorkChanged();
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
      notifyWorkChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not finalize pay period.");
    }
  }

  return (
    <section aria-labelledby="pay-period-heading" className="card pay-period-manager">
      <h2 id="pay-period-heading">Generate Payroll and Pay Periods</h2>
      <form onSubmit={handleCreate} className="form-row-group pay-period-manager__form">
        <div className="form-row">
          <label htmlFor="period-type">Type</label>
          <select id="period-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="BIWEEKLY">Biweekly (students)</option>
            <option value="MONTHLY">Monthly (faculty)</option>
          </select>
        </div>
        <DateField id="start-date" label="Start date" value={startDate} onChange={setStartDate} commitLabel="Create pay period" required />
        <DateField id="end-date" label="End date" value={endDate} onChange={setEndDate} commitLabel="Create pay period" required min={startDate || undefined} />
        <DateField id="pay-date" label="Pay date" value={payDate} onChange={setPayDate} commitLabel="Create pay period" required />
        <button type="submit">Create pay period</button>
      </form>


      <div className="table-scroll" role="region" aria-label="Existing pay periods" tabIndex={0}>
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
                  {dateLabel(p.startDate)} - {dateLabel(p.endDate)}
                </td>
                <td>{dateLabel(p.payDate)}</td>
                <td>{p.status}</td>
                <td className="button-row">
                  <button type="button" onClick={() => handleGenerate(p.id)} disabled={p.status === "CLOSED" || p.id === editingId} aria-label={`Generate pay stubs for ${dateLabel(p.startDate)} through ${dateLabel(p.endDate)}`}>
                    Generate stubs
                  </button>
                  <button type="button" onClick={() => handleFinalize(p.id)} disabled={p.status !== "PROCESSING" || p.id === editingId} aria-label={`Finalize pay period ${dateLabel(p.startDate)} through ${dateLabel(p.endDate)}`}>
                    Finalize
                  </button>
                  <button type="button" disabled={p.reportRowCount > 0 || saving}
                    aria-label={`Edit pay period ${dateLabel(p.startDate)} through ${dateLabel(p.endDate)}`}
                    aria-expanded={p.id === editingId}
                    onClick={(event) => {
                      editButton.current = event.currentTarget;
                      setEditing(p);
                      setMessage(null);
                      if (p.id === editingId) editForm.current?.querySelector("input")?.focus();
                    }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Periods with generated pay stubs are locked for editing.</p>
      {editing && (
        <form ref={editForm} onSubmit={handleEdit} className="form-row-group pay-period-manager__form" aria-label="Edit pay period">
          <DateField label="Start date" value={editing.startDate.slice(0, 10)} onChange={(value) => setEditing({ ...editing, startDate: value ? `${value}T00:00:00.000Z` : "" })} commitLabel="Save changes" required />
          <DateField label="End date" value={editing.endDate.slice(0, 10)} onChange={(value) => setEditing({ ...editing, endDate: value ? `${value}T23:59:59.000Z` : "" })} commitLabel="Save changes" required min={editing.startDate.slice(0, 10)} />
          <DateField label="Pay date" value={editing.payDate.slice(0, 10)} onChange={(value) => setEditing({ ...editing, payDate: value ? `${value}T00:00:00.000Z` : "" })} commitLabel="Save changes" required />
          <button type="submit" disabled={saving}>Save changes</button>
          <button type="button" disabled={saving} onClick={closeEdit}>Cancel</button>
        </form>
      )}
      <p role="status" aria-live="polite" className="status-message">
        {message}
      </p>
      <PayrollReport embedded />
    </section>
  );
}
