import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface StudentRate {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  payType: string;
  hourlyRate: string | null;
}

export function SupervisorPayRateManager() {
  const [students, setStudents] = useState<StudentRate[]>([]);
  const [rates, setRates] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    const data = await api.get<StudentRate[]>("/users");
    const hourlyStudents = data.filter((person) => person.role === "STUDENT" && person.payType === "BIWEEKLY");
    setStudents(hourlyStudents);
    setRates(Object.fromEntries(hourlyStudents.map((student) => [student.id, student.hourlyRate ?? ""])));
  }

  useEffect(() => { load().catch(() => setMessage("Could not load student pay rates.")); }, []);

  async function save(student: StudentRate) {
    const value = Number(rates[student.id]);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid hourly rate.");
      return;
    }
    setSavingId(student.id);
    setMessage("");
    try {
      const result = await api.patch<{ hourlyRate: string }>(`/users/${student.id}/hourly-rate`, { hourlyRate: value });
      setRates((current) => ({ ...current, [student.id]: result.hourlyRate }));
      setMessage(`${student.firstName}'s hourly rate is now $${result.hourlyRate}.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update the hourly rate.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="card supervisor-pay-rates" aria-labelledby="pay-rates-heading">
      <h2 id="pay-rates-heading" tabIndex={-1}>Student Hourly Pay Rates</h2>
      {students.length === 0 ? <p>No hourly student employees are assigned to you.</p> : students.map((student) => (
        <div className="pay-rate-row" key={student.id}>
          <label htmlFor={`hourly-rate-${student.id}`}>{student.firstName} {student.lastName}</label>
          <div className="pay-rate-row__controls">
            <span aria-hidden="true">$</span>
            <input id={`hourly-rate-${student.id}`} type="number" min="0.01" max="1000" step="0.01" value={rates[student.id] ?? ""} onChange={(event) => setRates((current) => ({ ...current, [student.id]: event.target.value }))} />
            <span>per hour</span>
            <button type="button" onClick={() => save(student)} disabled={savingId === student.id}>{savingId === student.id ? "Saving…" : "Save rate"}</button>
          </div>
        </div>
      ))}
      <p className="status-message" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
