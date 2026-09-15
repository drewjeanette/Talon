interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

function formatHours(entry: TimeEntry): string {
  if (!entry.clockOut) return "—";
  const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3_600_000;
  return hours.toFixed(2);
}

export function TimesheetTable({ entries, caption }: { entries: TimeEntry[]; caption: string }) {
  return (
    <div className="timesheet table-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Clock In</th>
            <th scope="col">Clock Out</th>
            <th scope="col">Hours</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={4}>No entries yet.</td>
            </tr>
          )}
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.clockIn).toLocaleString()}</td>
              <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "In progress"}</td>
              <td>{formatHours(entry)}</td>
              <td className={`status--${entry.status.toLowerCase()}`}>{entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
