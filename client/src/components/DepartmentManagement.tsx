import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface College {
  id: number;
  name: string;
  code: string;
}

interface Department {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  college: { id: number; name: string } | null;
}

interface EditDraft {
  name: string;
  code: string;
  collegeId: string;
  isActive: boolean;
}

export function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCollegeId, setNewCollegeId] = useState("");

  const [newCollegeName, setNewCollegeName] = useState("");
  const [newCollegeCode, setNewCollegeCode] = useState("");
  const [showAddCollege, setShowAddCollege] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  async function load() {
    const [depts, cols] = await Promise.all([
      api.get<Department[]>("/org/departments"),
      api.get<College[]>("/org/colleges"),
    ]);
    setDepartments(depts);
    setColleges(cols);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post("/org/departments", {
        code: newCode.trim(),
        name: newName.trim(),
        collegeId: newCollegeId ? Number(newCollegeId) : null,
      });
      setMessage(`Department ${newCode} created.`);
      setNewCode("");
      setNewName("");
      setNewCollegeId("");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not create department.");
    }
  }

  async function handleCreateCollege(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post("/org/colleges", { name: newCollegeName.trim(), code: newCollegeCode.trim() });
      setMessage(`College ${newCollegeCode} created.`);
      setNewCollegeName("");
      setNewCollegeCode("");
      setShowAddCollege(false);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not create college.");
    }
  }

  function startEdit(dept: Department) {
    setEditingId(dept.id);
    setDraft({
      name: dept.name,
      code: dept.code,
      collegeId: dept.college ? String(dept.college.id) : "",
      isActive: dept.isActive,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(id: number) {
    if (!draft) return;
    setMessage(null);
    try {
      await api.patch(`/org/departments/${id}`, {
        code: draft.code.trim(),
        name: draft.name.trim(),
        collegeId: draft.collegeId ? Number(draft.collegeId) : null,
        isActive: draft.isActive,
      });
      setMessage(`Department ${draft.code} updated.`);
      cancelEdit();
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update department.");
    }
  }

  return (
    <section aria-labelledby="departments-heading" className="card department-management">
      <h2 id="departments-heading">Department Management</h2>
      <p className="department-management__intro">
        Department codes live in the database, not source code - add, rename, reassign to a college,
        or deactivate any of them here. Deactivating hides a code from the "new user" form without
        deleting history for employees already assigned to it.
      </p>

      <form onSubmit={handleCreateDepartment} className="form-row-group department-management__form">
        <div className="form-row">
          <label htmlFor="new-dept-code">Code</label>
          <input id="new-dept-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} required maxLength={40} />
        </div>
        <div className="form-row">
          <label htmlFor="new-dept-name">Name</label>
          <input id="new-dept-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="new-dept-college">College</label>
          <select id="new-dept-college" value={newCollegeId} onChange={(e) => setNewCollegeId(e.target.value)}>
            <option value="">Unassigned</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Add department</button>
      </form>

      {showAddCollege ? (
        <form onSubmit={handleCreateCollege} className="form-row-group">
          <div className="form-row">
            <label htmlFor="new-college-name">College name</label>
            <input id="new-college-name" value={newCollegeName} onChange={(e) => setNewCollegeName(e.target.value)} required />
          </div>
          <div className="form-row">
            <label htmlFor="new-college-code">College code</label>
            <input id="new-college-code" value={newCollegeCode} onChange={(e) => setNewCollegeCode(e.target.value)} required maxLength={10} />
          </div>
          <div className="button-row">
            <button type="submit">Add college</button>
            <button type="button" onClick={() => setShowAddCollege(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setShowAddCollege(true)}>
          + Add a college
        </button>
      )}

      <div className="table-scroll department-management__table" role="region" aria-label="Department list" tabIndex={0}>
        <table>
          <caption className="sr-only">All departments</caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">College</th>
              <th scope="col">Active</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => {
              const isEditing = editingId === dept.id;
              return (
                <tr key={dept.id}>
                  {isEditing && draft ? (
                    <>
                      <td>
                        <label htmlFor={`edit-code-${dept.id}`} className="sr-only">
                          Code
                        </label>
                        <input
                          id={`edit-code-${dept.id}`}
                          value={draft.code}
                          onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                          maxLength={40}
                        />
                      </td>
                      <td>
                        <label htmlFor={`edit-name-${dept.id}`} className="sr-only">
                          Name
                        </label>
                        <input id={`edit-name-${dept.id}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </td>
                      <td>
                        <label htmlFor={`edit-college-${dept.id}`} className="sr-only">
                          College
                        </label>
                        <select
                          id={`edit-college-${dept.id}`}
                          value={draft.collegeId}
                          onChange={(e) => setDraft({ ...draft, collegeId: e.target.value })}
                        >
                          <option value="">Unassigned</option>
                          {colleges.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label htmlFor={`edit-active-${dept.id}`} className="sr-only">
                          Active
                        </label>
                        <input
                          id={`edit-active-${dept.id}`}
                          type="checkbox"
                          checked={draft.isActive}
                          onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                        />
                      </td>
                      <td className="button-row">
                        <button type="button" onClick={() => saveEdit(dept.id)}>
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{dept.code}</td>
                      <td>{dept.name}</td>
                      <td>{dept.college?.name ?? "Unassigned"}</td>
                      <td>{dept.isActive ? "Yes" : "No"}</td>
                      <td>
                        <button type="button" onClick={() => startEdit(dept)} aria-label={`Edit ${dept.name}`}>
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="status" aria-live="polite" className="status-message">
        {message}
      </p>
    </section>
  );
}
