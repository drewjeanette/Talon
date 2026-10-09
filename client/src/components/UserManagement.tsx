import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { displayName } from "../lib/nameSearch";
import { PersonSearch } from "./PersonSearch";

interface OrgUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  role: "STUDENT" | "SUPERVISOR" | "ADMIN";
  payType: "BIWEEKLY" | "MONTHLY";
  isActive: boolean;
  department: { id: number; name: string; code: string } | null;
  chargeAccount: { id: number; code: string; name: string } | null;
  supervisors: { id: number; name: string }[];
  jobs: { id: number; title: string; chargeAccount: { id: number; code: string; name: string } | null }[];
}

interface Department {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  college: { id: number; name: string } | null;
}

interface ChargeAccount {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

interface EditDraft {
  preferredName: string;
  departmentId: string;
  supervisorIds: number[];
}

export function UserManagement() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accounts, setAccounts] = useState<ChargeAccount[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<number[]>([]);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [role, setRole] = useState<"STUDENT" | "SUPERVISOR" | "ADMIN">("STUDENT");
  const [payType, setPayType] = useState<"BIWEEKLY" | "MONTHLY">("BIWEEKLY");
  const [departmentId, setDepartmentId] = useState("");
  const [chargeAccountId, setChargeAccountId] = useState("");
  const [supervisorIds, setSupervisorIds] = useState<number[]>([]);
  const [rate, setRate] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [newJob, setNewJob] = useState({ title: "", chargeAccountId: "" });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  async function load() {
    const [u, d, a] = await Promise.all([
      api.get<OrgUser[]>("/users"),
      api.get<Department[]>("/org/departments"),
      api.get<ChargeAccount[]>("/org/charge-accounts"),
    ]);
    setUsers(u);
    setDepartments(d);
    setAccounts(a);
  }

  useEffect(() => {
    load().catch(() => setMessage("Could not load users."));
  }, []);

  const people = useMemo(() => users.map((user) => ({ ...user, detail: [user.role.toLowerCase(), user.department?.name].filter(Boolean).join(" · ") })), [users]);
  const supervisorChoices = useMemo(() => people.filter((user) => user.isActive && user.role !== "STUDENT"), [people]);
  const activeDepartments = departments.filter((d) => d.isActive);
  const activeAccounts = accounts.filter((a) => a.isActive);
  const shown = filter.length ? users.filter((user) => filter.includes(user.id)) : users;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        email,
        firstName,
        lastName,
        preferredName: preferredName.trim() || undefined,
        role,
        payType,
        departmentId: departmentId ? Number(departmentId) : undefined,
        chargeAccountId: chargeAccountId ? Number(chargeAccountId) : undefined,
        jobTitle: role === "STUDENT" && jobTitle.trim() ? jobTitle.trim() : undefined,
        supervisorIds: role === "STUDENT" ? supervisorIds : undefined,
      };
      if (payType === "BIWEEKLY" || role === "STUDENT") payload.hourlyRate = Number(rate);
      else payload.annualSalary = Number(rate);

      const result = await api.post<{ email: string; tempPassword: string }>("/users", payload);
      setMessage(`Created ${result.email}. Temporary password: ${result.tempPassword} (share securely, one time only)`);
      setEmail("");
      setFirstName("");
      setLastName("");
      setPreferredName("");
      setRate("");
      setSupervisorIds([]);
      setJobTitle("");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not create user.");
    }
  }

  function startEdit(user: OrgUser) {
    setEditingId(user.id);
    setDraft({
      preferredName: user.preferredName ?? "",
      departmentId: user.department ? String(user.department.id) : "",
      supervisorIds: user.supervisors.map((supervisor) => supervisor.id),
    });
    setNewJob({ title: "", chargeAccountId: "" });
    setMessage(null);
  }

  async function addJob(user: OrgUser) {
    if (!newJob.title.trim()) {
      setMessage("Enter a job title.");
      return;
    }
    try {
      await api.post(`/users/${user.id}/jobs`, { title: newJob.title.trim(), chargeAccountId: newJob.chargeAccountId ? Number(newJob.chargeAccountId) : null });
      setMessage(`Added ${newJob.title.trim()} for ${displayName(user)}.`);
      setNewJob({ title: "", chargeAccountId: "" });
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not add the job.");
    }
  }

  async function endJob(user: OrgUser, job: OrgUser["jobs"][number]) {
    try {
      await api.patch(`/users/${user.id}/jobs/${job.id}`, { isActive: false });
      setMessage(`Ended ${job.title} for ${displayName(user)}. Past shifts keep it.`);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not end the job.");
    }
  }

  async function saveEdit(user: OrgUser) {
    if (!draft) return;
    setMessage(null);
    try {
      await api.patch(`/users/${user.id}`, {
        preferredName: draft.preferredName.trim() || null,
        departmentId: draft.departmentId ? Number(draft.departmentId) : null,
        ...(user.role === "STUDENT" ? { supervisorIds: draft.supervisorIds } : {}),
      });
      setMessage(`Saved changes for ${displayName({ ...user, preferredName: draft.preferredName })}.`);
      setEditingId(null);
      setDraft(null);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save the changes.");
    }
  }

  async function handleDeactivate(user: OrgUser) {
    setMessage(null);
    try {
      await api.patch(`/users/${user.id}/deactivate`);
      setMessage(`Deactivated ${displayName(user)}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not deactivate user.");
    }
  }

  const departmentOptions = (
    <>
      <option value="">None</option>
      {activeDepartments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.code} - {d.name}
          {d.college ? ` (${d.college.name})` : ""}
        </option>
      ))}
    </>
  );
  const accountOptions = (
    <>
      <option value="">None</option>
      {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
    </>
  );

  return (
    <section aria-labelledby="users-heading" className="card user-management">
      <h2 id="users-heading">User Management</h2>
      <form onSubmit={handleCreate} className="form-row-group user-management__form">
        <div className="form-row">
          <label htmlFor="new-email">Email</label>
          <input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="new-first">First name</label>
          <input id="new-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="new-preferred">Preferred name (optional)</label>
          <input id="new-preferred" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} maxLength={60} placeholder="e.g. Sophie" />
        </div>
        <div className="form-row">
          <label htmlFor="new-last">Last name</label>
          <input id="new-last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="new-role">Role</label>
          <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="STUDENT">Student</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-paytype">Pay type</label>
          <select id="new-paytype" value={payType} onChange={(e) => setPayType(e.target.value as typeof payType)}>
            <option value="BIWEEKLY">Biweekly (hourly)</option>
            <option value="MONTHLY">{role === "STUDENT" ? "Monthly (hourly)" : "Monthly (salary)"}</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-dept">Home department</label>
          <select id="new-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>{departmentOptions}</select>
        </div>
        {role === "STUDENT" && (
          <div className="form-row">
            <label htmlFor="new-job-title">Job title</label>
            <input id="new-job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} placeholder="e.g. Lab Assistant" />
          </div>
        )}
        <div className="form-row">
          <label htmlFor="new-account">Charge account (index)</label>
          <select id="new-account" value={chargeAccountId} onChange={(e) => setChargeAccountId(e.target.value)}>{accountOptions}</select>
        </div>
        <div className="form-row">
          <label htmlFor="new-rate">{payType === "BIWEEKLY" || role === "STUDENT" ? "Starting hourly rate ($)" : "Annual salary ($)"}</label>
          <input id="new-rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </div>
        {role === "STUDENT" && (
          <div className="user-management__supervisors">
            <PersonSearch label="Supervisors" people={supervisorChoices} value={supervisorIds} onChange={setSupervisorIds} multiple hint="Any of them can approve this student's time." />
          </div>
        )}
        <button type="submit">Create user</button>
      </form>
      <p className="form-help">Change hourly rates later in Time Entry Approvals → Student Hourly Pay Rates.</p>

      <div className="user-management__search">
        <PersonSearch label="Find people" people={people} value={filter} onChange={setFilter} multiple />
      </div>

      <div className="table-scroll" role="region" aria-label="All users" tabIndex={0}>
        <table>
          <caption className="sr-only">All users</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Home department</th>
              <th scope="col">Jobs / charge account</th>
              <th scope="col">Supervisors</th>
              <th scope="col">Active</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => editingId === u.id && draft ? (
              <tr key={u.id} className="user-management__editing">
                <th scope="row">{displayName(u)}</th>
                <td colSpan={7}>
                  <div className="user-management__edit">
                    <div className="form-row">
                      <label htmlFor={`edit-preferred-${u.id}`}>Preferred name</label>
                      <input id={`edit-preferred-${u.id}`} value={draft.preferredName} maxLength={60} onChange={(e) => setDraft({ ...draft, preferredName: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <label htmlFor={`edit-dept-${u.id}`}>Home department</label>
                      <select id={`edit-dept-${u.id}`} value={draft.departmentId} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}>{departmentOptions}</select>
                    </div>
                    {u.role === "STUDENT" && (
                      <fieldset className="user-management__jobs">
                        <legend>Jobs</legend>
                        <p className="form-help">With two or more jobs, the student picks one each time they clock in.</p>
                        <ul>
                          {u.jobs.map((job) => (
                            <li key={job.id}>
                              <span><strong>{job.title}</strong> · {job.chargeAccount ? `${job.chargeAccount.code} – ${job.chargeAccount.name}` : "No charge account"}</span>
                              <button type="button" className="button--secondary" onClick={() => endJob(u, job)} aria-label={`End job ${job.title}`}>End job</button>
                            </li>
                          ))}
                          {u.jobs.length === 0 && <li>No current jobs.</li>}
                        </ul>
                        <div className="user-management__new-job">
                          <div className="form-row">
                            <label htmlFor={`new-job-title-${u.id}`}>New job title</label>
                            <input id={`new-job-title-${u.id}`} value={newJob.title} maxLength={80} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} />
                          </div>
                          <div className="form-row">
                            <label htmlFor={`new-job-account-${u.id}`}>New job charge account</label>
                            <select id={`new-job-account-${u.id}`} value={newJob.chargeAccountId} onChange={(e) => setNewJob({ ...newJob, chargeAccountId: e.target.value })}>{accountOptions}</select>
                          </div>
                          <button type="button" onClick={() => addJob(u)}>Add job</button>
                        </div>
                      </fieldset>
                    )}
                    {u.role === "STUDENT" && (
                      <PersonSearch label="Supervisors" people={supervisorChoices} value={draft.supervisorIds} onChange={(ids) => setDraft({ ...draft, supervisorIds: ids })} multiple />
                    )}
                    <div className="button-row">
                      <button type="button" onClick={() => saveEdit(u)}>Save changes</button>
                      <button type="button" className="button--secondary" onClick={() => { setEditingId(null); setDraft(null); }}>Cancel</button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={u.id}>
                <th scope="row">{displayName(u)}</th>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.department?.name ?? "—"}</td>
                <td>{u.role === "STUDENT" && u.jobs.length
                  ? u.jobs.map((job) => <span key={job.id} className="user-management__job">{job.title}{job.chargeAccount ? ` (${job.chargeAccount.code})` : ""}</span>)
                  : <span title={u.chargeAccount?.name}>{u.chargeAccount?.code ?? "—"}</span>}</td>
                <td>{u.role === "STUDENT" ? (u.supervisors.map((s) => s.name).join(", ") || "None assigned") : "—"}</td>
                <td>{u.isActive ? "Yes" : "No"}</td>
                <td>
                  <div className="button-row">
                    <button type="button" onClick={() => startEdit(u)} aria-label={`Edit ${displayName(u)}`}>Edit</button>
                    <button type="button" onClick={() => handleDeactivate(u)} disabled={!u.isActive} className="button--danger" aria-label={`Deactivate ${displayName(u)}`}>
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status" aria-live="polite" className="status-message">
        {message}
      </p>
    </section>
  );
}
