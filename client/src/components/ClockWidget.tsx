import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export function ClockWidget({ onChange }: { onChange?: () => void }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.get<TimeEntry[]>("/timeclock/my-entries");
    setEntries(data);
  }

  useEffect(() => {
    load();
  }, []);

  const openEntry = entries.find((e) => e.clockOut === null);

  async function handleClockIn() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/timeclock/clock-in");
      setMessage("Clocked in.");
      await load();
      onChange?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/timeclock/clock-out");
      setMessage("Clocked out.");
      await load();
      onChange?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not clock out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="clock-heading" className="card">
      <h2 id="clock-heading">Web Clock</h2>
      <p>
        Status:{" "}
        <strong>{openEntry ? `Clocked in since ${new Date(openEntry.clockIn).toLocaleTimeString()}` : "Clocked out"}</strong>
      </p>
      <div className="button-row">
        <button type="button" onClick={handleClockIn} disabled={busy || !!openEntry}>
          Clock In
        </button>
        <button type="button" onClick={handleClockOut} disabled={busy || !openEntry}>
          Clock Out
        </button>
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
