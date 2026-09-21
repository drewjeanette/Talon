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
  const [now, setNow] = useState(() => Date.now());
  const [lastShiftDuration, setLastShiftDuration] = useState<number | null>(null);

  async function load() {
    const data = await api.get<TimeEntry[]>("/timeclock/my-entries");
    setEntries(data);
  }

  useEffect(() => {
    load();
  }, []);

  const openEntry = entries.find((e) => e.clockOut === null);

  useEffect(() => {
    if (!openEntry) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [openEntry?.id]);

  function formatDuration(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

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
      const completed = await api.post<TimeEntry>("/timeclock/clock-out");
      if (completed.clockOut) {
        setLastShiftDuration(new Date(completed.clockOut).getTime() - new Date(completed.clockIn).getTime());
      }
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
    <section aria-labelledby="clock-heading" className="card clock-widget">
      <h2 id="clock-heading">Web Clock</h2>
      <p className="clock-widget__status">
        Status:{" "}
        <strong>{openEntry ? `Clocked in since ${new Date(openEntry.clockIn).toLocaleTimeString()}` : "Clocked out"}</strong>
      </p>
      {(openEntry || lastShiftDuration !== null) && (
        <p className="clock-widget__elapsed" aria-live="off">
          {openEntry ? "Current shift" : "Last shift"}:{" "}
          <strong>{formatDuration(openEntry ? now - new Date(openEntry.clockIn).getTime() : lastShiftDuration ?? 0)}</strong>
        </p>
      )}
      <div className="button-row clock-widget__actions">
        <button type="button" onClick={handleClockIn} disabled={busy || !!openEntry} className="clock-widget__in">
          Clock In
        </button>
        <button type="button" onClick={handleClockOut} disabled={busy || !openEntry} className="clock-widget__out">
          Clock Out
        </button>
      </div>
      <p role="status" aria-live="polite" className="status-message">
        {message}
      </p>
    </section>
  );
}
