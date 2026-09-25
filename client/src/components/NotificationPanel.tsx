import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  action: string | null;
  requiresAction: boolean;
  read: boolean;
  createdAt: string;
  senderName: string;
}

export function NotificationPanel({ onReportSender }: { onReportSender?: (name: string | null) => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await api.get<NotificationItem[]>("/notifications");
      setItems(data);
      onReportSender?.(data.find((item) => item.type === "REPORT_READY" && item.requiresAction)?.senderName ?? null);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not load notifications.");
    }
  }

  useEffect(() => { load(); }, []);

  const item = items[0];
  if (!item) return message ? <p className="status-message" role="status">{message}</p> : null;
  const unread = items.filter((notification) => !notification.read).length;

  async function update(changes: { read?: boolean; dismissed?: boolean }) {
    try {
      await api.patch(`/notifications/${item.id}`, changes);
      if (changes.dismissed) {
        const remaining = items.slice(1);
        setItems(remaining);
        setOpen(false);
        onReportSender?.(remaining.find((notification) => notification.type === "REPORT_READY" && notification.requiresAction)?.senderName ?? null);
      } else {
        setItems((current) => current.map((notification) => notification.id === item.id ? { ...notification, read: changes.read ?? notification.read } : notification));
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update notification.");
    }
  }

  function openReport() {
    update({ read: true });
    document.querySelector(".report-generator")?.scrollIntoView({ behavior: "smooth", block: "start" });
    (document.querySelector("#report-heading") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  return (
    <section className="card talon-notifications" aria-label="Report notifications">
      <div className="talon-notification__summary">
        <button type="button" className="talon-notification__bell" aria-label="View report notification" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          {unread > 0 && <span className="talon-notifications__badge" aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}>{unread}</span>}
        </button>
        <p className="talon-notification__line"><strong>From {item.senderName}</strong> — {item.title}</p>
        <button type="button" className="talon-notification__view" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "View"}</button>
      </div>
      {open && <div className="talon-notification__detail">
        <p>{item.body}</p>
        <div className="talon-notification__actions">
          {item.action === "OPEN_REPORT" && <button type="button" className="talon-notification__open" onClick={openReport}>Open Report</button>}
          <button type="button" className="talon-notification__read" onClick={() => update({ read: true })} disabled={item.read}>{item.read ? "Marked as Read" : "Mark as Read"}</button>
          <button type="button" className="talon-notification__dismiss" onClick={() => update({ read: true, dismissed: true })}>Dismiss</button>
        </div>
      </div>}
      {message && <p className="status-message" role="status">{message}</p>}
    </section>
  );
}
