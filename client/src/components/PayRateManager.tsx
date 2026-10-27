import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { displayName } from "../lib/nameSearch";
import { PersonSearch } from "./PersonSearch";

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  role: string;
  payType: "BIWEEKLY" | "MONTHLY";
  hourlyRate: string | null;
  isActive: boolean;
  department: { name: string } | null;
  chargeAccount: { code: string } | null;
}

const PAGE_SIZE = 10;

/**
 * Hourly rates for student workers. Admins can change any student's rate;
 * supervisors can change the rates of students assigned to them. Changes
 * apply the next time pay stubs are generated.
 */
export function PayRateManager() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [rates, setRates] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    const data = await api.get<Student[]>("/users");
    const hourly = data.filter((person) => person.role === "STUDENT" && person.isActive);
    setStudents(hourly);
    setRates(Object.fromEntries(hourly.map((student) => [student.id, student.hourlyRate ?? ""])));
  }

  useEffect(() => { load().catch(() => setMessage("Could not load student pay rates.")); }, []);

  const people = useMemo(() => students.map((student) => ({
    ...student,
    detail: [student.department?.name, student.chargeAccount?.code].filter(Boolean).join(" · "),
  })), [students]);
  const sortedStudents = useMemo(() => [...students].sort((a, b) => displayName(a).localeCompare(displayName(b))), [students]);
  const pageCount = Math.ceil(students.length / PAGE_SIZE);
  const shown = filter.length
    ? sortedStudents.filter((student) => filter.includes(student.id))
    : showAll ? sortedStudents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  function selectStudents(ids: number[]) {
    setFilter(ids);
    setShowAll(false);
    setPage(0);
  }

  async function save(student: Student) {
    const value = Number(rates[student.id]);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage(`Enter a valid hourly rate for ${displayName(student)}.`);
      return;
    }
    setSavingId(student.id);
    setMessage("");
    try {
      const result = await api.patch<{ hourlyRate: string }>(`/users/${student.id}/hourly-rate`, { hourlyRate: value });
      setRates((current) => ({ ...current, [student.id]: result.hourlyRate }));
      setStudents((current) => current.map((item) => (item.id === student.id ? { ...item, hourlyRate: result.hourlyRate } : item)));
      setMessage(`${displayName(student)}'s hourly rate is now $${result.hourlyRate}. It applies the next time pay stubs are generated.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update the hourly rate.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="card supervisor-pay-rates pay-rate-manager" aria-labelledby="pay-rates-heading">
      <h2 id="pay-rates-heading" tabIndex={-1}>Student Hourly Pay Rates</h2>
      <p className="pay-rate-manager__intro">
        {user?.role === "ADMIN" ? "Change any student's hourly rate." : "Change the hourly rate for students assigned to you."} New rates apply the next time pay stubs are generated.
      </p>
      {students.length > 0 && <>
        <PersonSearch label="Find students" people={people} value={filter} onChange={selectStudents} multiple />
        <div className="pay-rate-manager__browse">
          <button type="button" className="button--secondary" aria-expanded={showAll} aria-controls="pay-rate-results" onClick={() => { setShowAll(!showAll); setFilter([]); setPage(0); }}>
            {showAll ? "Search students only" : "View all students"}
          </button>
          <p role="status">{showAll
            ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, students.length)} of ${students.length} students.`
            : filter.length ? `${shown.length} student${shown.length === 1 ? "" : "s"} selected.`
              : "Search and select students to view or edit their hourly rates."}</p>
        </div>
      </>}
      <div id="pay-rate-results">
      {students.length === 0 ? <p>No student employees are assigned to you.</p> : shown.map((student) => {
        const changed = (rates[student.id] ?? "") !== (student.hourlyRate ?? "");
        return (
          <div className="pay-rate-row" key={student.id}>
            <label htmlFor={`hourly-rate-${student.id}`}>
              {displayName(student)}
              <span className="pay-rate-row__meta">{[student.department?.name, student.payType === "MONTHLY" ? "Monthly" : "Bi-weekly"].filter(Boolean).join(" · ")}</span>
            </label>
            <div className="pay-rate-row__controls">
              <span aria-hidden="true">$</span>
              <input id={`hourly-rate-${student.id}`} type="number" min="0.01" max="1000" step="0.01" inputMode="decimal" value={rates[student.id] ?? ""} onChange={(event) => setRates((current) => ({ ...current, [student.id]: event.target.value }))} />
              <span>per hour</span>
              <button type="button" onClick={() => save(student)} disabled={savingId === student.id || !changed}>{savingId === student.id ? "Saving…" : "Save rate"}</button>
            </div>
          </div>
        );
      })}
      </div>
      {showAll && pageCount > 1 && <nav className="pay-rate-manager__browse" aria-label="Pay rate pages">
        <button type="button" className="button--secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous page</button>
        <span>Page {page + 1} of {pageCount}</span>
        <button type="button" className="button--secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next page</button>
      </nav>}
      <p className="status-message" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
