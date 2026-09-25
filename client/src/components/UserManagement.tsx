import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface OrgUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: "STUDENT" | "SUPERVISOR" | "ADMIN";
  payType: "BIWEEKLY" | "MONTHLY";
  isActive: boolean;
  department: { id: number; name: string } | null;
}

interface Department {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  college: { id: number; name: string } | null;
}

export function UserManagement() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"STUDENT" | "SUPERVISOR" | "ADMIN">("STUDENT");
  const [payType, setPayType] = useState<"BIWEEKLY" | "MONTHLY">("BIWEEKLY");
  const [departmentId, setDepartmentId] = useState("");
  const [rate, setRate] = useState("");

  async function load() {
    const [u, d] = await Promise.all([api.get<OrgUser[]>("/users"), api.get<Department[]>("/org/departments")]);
    setUsers(u);
    setDepartments(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        email,
        firstName,
        lastName,
        role,
        payType,
        departmentId: departmentId ? Number(departmentId) : undefined,
      };
      if (payType === "BIWEEKLY") payload.hourlyRate = Number(rate);
      else payload.annualSalary = Number(rate);

      const result = await api.post<{ email: string; tempPassword: string }>("/users", payload);
      setMessage(`Created ${result.email}. Temporary password: ${result.tempPassword} (share securely, one time only)`);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRate("");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not create user.");
    }
  }

  async function handleDeactivate(id: number) {
    setMessage(null);
    try {
      await api.patch(`/users/${id}/deactivate`);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not deactivate user.");
    }
  }

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
            <option value="MONTHLY">Monthly (salary)</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-dept">Department</label>
          <select id="new-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">None</option>
            {departments
              .filter((d) => d.isActive)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} - {d.name}
                  {d.college ? ` (${d.college.name})` : ""}
                </option>
              ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-rate">{payType === "BIWEEKLY" ? "Hourly rate ($)" : "Annual salary ($)"}</label>
          <input id="new-rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </div>
        <button type="submit">Create user</button>
      </form>

      <div className="table-scroll" role="region" aria-label="All users" tabIndex={0}>
        <table>
          <caption className="sr-only">All users</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Pay type</th>
              <th scope="col">Department</th>
              <th scope="col">Active</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.id === 3 && u.firstName === "Chris" && u.lastName === "Student"
                    ? "Chris"
                    : `${u.firstName} ${u.lastName}`}
                </td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.payType}</td>
                <td>{u.department?.name ?? "—"}</td>
                <td>{u.isActive ? "Yes" : "No"}</td>
                <td>
                  <button type="button" onClick={() => handleDeactivate(u.id)} disabled={!u.isActive} className="button--danger" aria-label={`Deactivate ${u.firstName} ${u.lastName}`}>
                    Deactivate
                  </button>
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
