import { useCallback, useState } from "react";
import { displayName } from "../lib/nameSearch";
import { PersonSearch, type SearchablePerson } from "./PersonSearch";
import { StudentComparisonEntries, type EntryLoadStatus } from "./StudentComparisonEntries";

interface ReportStudent extends SearchablePerson {
  email: string;
  payType: "BIWEEKLY" | "MONTHLY";
  isActive: boolean;
  department: { name: string } | null;
  supervisors: { name: string }[];
  jobs: { id: number; title: string; chargeAccount: { code: string; name: string } | null }[];
}

export function StudentReports({ students, selected, onChange }: {
  students: ReportStudent[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [loadStatus, setLoadStatus] = useState<Record<number, EntryLoadStatus>>({});
  const [preparedAt, setPreparedAt] = useState(() => new Date());
  const updateStatus = useCallback((id: number, status: EntryLoadStatus) => {
    setLoadStatus((current) => current[id] === status ? current : { ...current, [id]: status });
  }, []);
  const chosen = selected.map((id) => students.find((student) => student.id === id)).filter((student): student is ReportStudent => Boolean(student));
  const ready = chosen.length > 0 && chosen.every((student) => loadStatus[student.id] === "ready");
  const hasError = chosen.some((student) => loadStatus[student.id] === "error");

  function printReport() {
    if (!ready) return;
    setPreparedAt(new Date());
    window.requestAnimationFrame(() => window.print());
  }

  return <section className="student-reports" aria-labelledby="student-reports-heading">
    <h3 id="student-reports-heading">Student Reports</h3>
    <p className="student-reports__controls">Select any number of students to view their profiles and time entries together.</p>
    <div className="student-reports__controls">
      <PersonSearch label="Students in report" people={students} value={selected} onChange={onChange} multiple />
    </div>
    <p className="student-reports__prepared">{chosen.length} {chosen.length === 1 ? "student" : "students"} · Prepared {preparedAt.toLocaleString()}</p>
    <div className="student-comparison__grid student-reports__grid">
      {chosen.map((student) => <section key={student.id} className="student-comparison__card student-reports__card" aria-label={`Report for ${displayName(student)}`}>
        <h4>{displayName(student)}</h4>
        <dl className="student-comparison__details">
          <div><dt>Email</dt><dd>{student.email}</dd></div>
          <div><dt>Home department</dt><dd>{student.department?.name ?? "None assigned"}</dd></div>
          <div><dt>Title</dt><dd>{student.jobs.length ? student.jobs.map((job) => <div key={job.id}>{job.title}{job.chargeAccount && <div>Charge account: {job.chargeAccount.code} – {job.chargeAccount.name}</div>}</div>) : "No current jobs"}</dd></div>
          <div><dt>Supervisors</dt><dd>{student.supervisors.map((supervisor) => supervisor.name).join(", ") || "None assigned"}</dd></div>
          <div><dt>Pay type</dt><dd>{student.payType === "BIWEEKLY" ? "Biweekly" : "Monthly"}</dd></div>
          <div><dt>Active</dt><dd>{student.isActive ? "Yes" : "No"}</dd></div>
        </dl>
        <StudentComparisonEntries studentId={student.id} name={displayName(student)} onStatusChange={updateStatus} />
      </section>)}
    </div>
    <div className="student-reports__footer">
      <p id="student-report-status" role="status">{!chosen.length ? "Choose students to build a report."
        : hasError ? "Some time entries could not be loaded. Retry them before printing."
        : !ready ? "Loading selected students’ time entries…"
        : `Report ready for ${chosen.length} ${chosen.length === 1 ? "student" : "students"}.`}</p>
      <button type="button" onClick={printReport} disabled={!ready} aria-describedby="student-report-status">Print report</button>
    </div>
  </section>;
}
