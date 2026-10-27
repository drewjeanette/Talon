import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useWorkChanged } from "../lib/work";

interface TimeNotice { id: number; type: string; title: string; body: string; senderName: string }

export function StudentTimeNotifications() {
  const [notices, setNotices] = useState<TimeNotice[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    try {
      const items = await api.get<TimeNotice[]>("/notifications");
      setNotices(items.filter((item) => /^TIME_(ENTRY|CORRECTION)_(APPROVED|REJECTED)$/.test(item.type)));
      setMessage("");
    } catch {
      setMessage("Could not load your time request updates.");
    }
  }
  useEffect(() => { load(); }, []);
  useWorkChanged(load);

  async function dismiss(id: number) {
    setBusy(id);
    try {
      await api.patch(`/notifications/${id}`, { read: true, dismissed: true });
      setNotices((current) => current.filter((item) => item.id !== id));
      setMessage("Time request update dismissed.");
    } catch {
      setMessage("Could not dismiss this update. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return <>
    <p className="sr-only" role="status">{message}</p>
    {notices.length > 0 && <section className="card student-time-notifications" aria-labelledby="time-updates-heading">
      <h2 id="time-updates-heading">Time request updates</h2>
      <ul aria-live="polite" aria-relevant="additions">
        {notices.map((item) => <li key={item.id}>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <p>Reviewed by {item.senderName}</p>
          <button type="button" className="button--secondary" disabled={busy !== null} onClick={() => dismiss(item.id)} aria-label={`Dismiss ${item.title.toLowerCase()} update`}>Dismiss</button>
        </li>)}
      </ul>
    </section>}
  </>;
}
