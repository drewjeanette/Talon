import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface PendingEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  user: { id: number; firstName: string; lastName: string };
}

export function ApprovalQueue() {
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await api.get<PendingEntry[]>("/timeclock/pending");
    setEntries(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: number, status: "APPROVED" | "REJECTED") {
    setMessage(null);
    try {
      await api.patch(`/timeclock/${id}/decision`, { status });
      setMessage(`Entry ${id} ${status.toLowerCase()}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update entry.");
    }
  }

  return (
    <section aria-labelledby="approvals-heading" className="card">
      <h2 id="approvals-heading">Pending Time Entry Approvals</h2>
      <table>
        <caption className="sr-only">Time entries awaiting approval</caption>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Clock In</th>
            <th scope="col">Clock Out</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={4}>Nothing pending.</td>
            </tr>
          )}
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                {entry.user.firstName} {entry.user.lastName}
              </td>
              <td>{new Date(entry.clockIn).toLocaleString()}</td>
              <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
              <td className="button-row">
                <button type="button" onClick={() => decide(entry.id, "APPROVED")}>
                  Approve
                </button>
                <button type="button" onClick={() => decide(entry.id, "REJECTED")} className="button--danger">
                  Reject
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
