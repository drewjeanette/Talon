import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";

interface NotificationPreference {
  type: string;
  label: string;
  description: string;
  emailEnabled: boolean;
}

export function NotificationSettings() {
  const [saved, setSaved] = useState<NotificationPreference[] | null>(null);
  const [draft, setDraft] = useState<NotificationPreference[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<NotificationPreference[]>("/settings/notifications")
      .then((data) => { setSaved(data); setDraft(data); })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your notification settings."));
  }, []);

  const changed = draft.filter((d) => saved?.find((s) => s.type === d.type)?.emailEnabled !== d.emailEnabled);

  function toggle(type: string, emailEnabled: boolean) {
    setStatus(null);
    setDraft((rows) => rows.map((row) => (row.type === type ? { ...row, emailEnabled } : row)));
  }

  function setAll(emailEnabled: boolean) {
    setStatus(null);
    setDraft((rows) => rows.map((row) => ({ ...row, emailEnabled })));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.patch("/settings/notifications", {
        preferences: changed.map(({ type, emailEnabled }) => ({ type, emailEnabled })),
      });
      setSaved(draft);
      setStatus("Notification settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your notification settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card settings-card" onSubmit={save} aria-labelledby="notification-settings-heading">
      <h2 id="notification-settings-heading">Email Notifications</h2>
      <p className="form-help">
        Choose which updates Talon emails to you. Your dashboard notifications and to-do list are not affected.
      </p>

      {!saved && !error && <p role="status">Loading...</p>}

      {saved && (
        <>
          <div className="button-row settings-card__bulk">
            <button type="button" className="button--secondary" onClick={() => setAll(true)}>Turn all on</button>
            <button type="button" className="button--secondary" onClick={() => setAll(false)}>Turn all off</button>
          </div>
          <ul className="settings-list">
            {draft.map((row) => (
              <li key={row.type} className="settings-list__item">
                <div>
                  <label htmlFor={`notify-${row.type}`} className="settings-list__label">{row.label}</label>
                  <span id={`notify-${row.type}-desc`} className="form-help">{row.description}</span>
                </div>
                <input
                  id={`notify-${row.type}`}
                  type="checkbox"
                  role="switch"
                  className="settings-switch"
                  checked={row.emailEnabled}
                  onChange={(e) => toggle(row.type, e.target.checked)}
                  aria-describedby={`notify-${row.type}-desc`}
                />
              </li>
            ))}
            <li className="settings-list__item settings-list__item--locked">
              <div>
                <span className="settings-list__label">Password and security alerts</span>
                <span className="form-help">Password reset links and password-change alerts are always sent.</span>
              </div>
              <span className="settings-list__always">Always on</span>
            </li>
          </ul>
        </>
      )}

      {error && <p role="alert" className="form-error">{error}</p>}
      <p role="status" aria-live="polite" className="settings-card__status">{status}</p>
      {saved && <button type="submit" disabled={busy || changed.length === 0}>{busy ? "Saving..." : "Save changes"}</button>}
    </form>
  );
}
