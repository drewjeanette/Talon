import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";

interface ChargeAccount {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  department: { id: number; name: string; code: string } | null;
}

interface Department {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

/**
 * Charge accounts (Banner index codes). A student's job is charged to one,
 * which can belong to a different department than their home department.
 */
export function ChargeAccountManagement() {
  const [accounts, setAccounts] = useState<ChargeAccount[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [a, d] = await Promise.all([api.get<ChargeAccount[]>("/org/charge-accounts"), api.get<Department[]>("/org/departments")]);
    setAccounts(a);
    setDepartments(d.filter((department) => department.isActive));
  }

  useEffect(() => { load().catch(() => setMessage("Could not load charge accounts.")); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api.post("/org/charge-accounts", { code: code.trim(), name: name.trim(), departmentId: departmentId ? Number(departmentId) : null });
      setMessage(`Charge account ${code.trim()} added.`);
      setCode("");
      setName("");
      setDepartmentId("");
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not add the charge account.");
    }
  }

  async function toggle(account: ChargeAccount) {
    setMessage("");
    try {
      await api.patch(`/org/charge-accounts/${account.id}`, { isActive: !account.isActive });
      setMessage(`${account.code} ${account.isActive ? "retired" : "reactivated"}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update the charge account.");
    }
  }

  return (
    <section aria-labelledby="charge-accounts-heading" className="card department-management charge-accounts">
      <h2 id="charge-accounts-heading">Charge Accounts</h2>
      <p className="department-management__intro">
        The index a student's pay is charged to. It can differ from their home department, for example a Computer
        Science student paid from a Mathematics grant. Payroll reports can be filtered and grouped by charge account.
      </p>
      <form onSubmit={create} className="form-row-group department-management__form">
        <div className="form-row">
          <label htmlFor="new-account-code">Index code</label>
          <input id="new-account-code" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={40} />
        </div>
        <div className="form-row">
          <label htmlFor="new-account-name">Account name</label>
          <input id="new-account-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        </div>
        <div className="form-row">
          <label htmlFor="new-account-department">Owning department</label>
          <select id="new-account-department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">None</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.code} - {department.name}</option>)}
          </select>
        </div>
        <button type="submit">Add charge account</button>
      </form>
      <div className="table-scroll" role="region" aria-label="Charge accounts" tabIndex={0}>
        <table>
          <caption className="sr-only">Charge accounts</caption>
          <thead><tr><th scope="col">Index</th><th scope="col">Name</th><th scope="col">Owning department</th><th scope="col">Active</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={5}>No charge accounts yet.</td></tr>}
            {accounts.map((account) => (
              <tr key={account.id}>
                <th scope="row">{account.code}</th>
                <td>{account.name}</td>
                <td>{account.department ? `${account.department.code} - ${account.department.name}` : "—"}</td>
                <td>{account.isActive ? "Yes" : "No"}</td>
                <td><button type="button" className={account.isActive ? "button--secondary" : undefined} onClick={() => toggle(account)} aria-label={`${account.isActive ? "Retire" : "Reactivate"} ${account.code}`}>{account.isActive ? "Retire" : "Reactivate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status" aria-live="polite" className="status-message">{message}</p>
    </section>
  );
}
