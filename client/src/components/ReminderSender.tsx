import { useState } from "react";
import { api, ApiError } from "../api/client";

/**
 * Lets an admin email each supervisor a single checklist of their students'
 * time waiting for approval. Talon also sends these automatically before
 * every payroll deadline.
 */
export function ReminderSender() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.post<{ supervisors: number }>("/payroll/reminders");
      setMessage(result.supervisors
        ? `Sent ${result.supervisors} summary email${result.supervisors === 1 ? "" : "s"}, one per supervisor with time waiting.`
        : "No supervisors have time waiting, so no emails were sent.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not send reminders.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card reminder-sender" aria-labelledby="reminder-sender-heading">
      <h2 id="reminder-sender-heading">Approval Reminders</h2>
      <p>
        Before each payroll deadline Talon emails supervisors one printable checklist of every student waiting on them
        (bi-weekly: Friday before close, Monday morning, and a 10 AM escalation; monthly: before the 25th). Nothing is
        sent when nothing is waiting.
      </p>
      <button type="button" onClick={send} disabled={busy}>{busy ? "Sending…" : "Email supervisors now"}</button>
      <p className="status-message" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
