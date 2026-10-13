import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { DateField } from "../DateField";

interface PayrollCalendar {
  enabled: boolean;
  biweekly: { advanceDaysBeforeClose: number; advanceTime: string; dueDaysAfterClose: number; deadlineMorningTime: string; escalationTime: string; dueTime: string };
  monthly: { dueDayOfMonth: number; advanceBusinessDays: number; advanceTime: string; deadlineMorningTime: string; escalationTime: string; dueTime: string };
}

interface Upcoming {
  payPeriodId: number;
  periodType: "BIWEEKLY" | "MONTHLY";
  periodEnd: string;
  stage: "advance" | "deadline-morning" | "escalation";
  at: string;
}

const STAGE_LABELS: Record<Upcoming["stage"], string> = {
  advance: "First reminder",
  "deadline-morning": "Deadline-morning reminder",
  escalation: "Escalation + admin summary",
};

const COMMIT = "Save payroll calendar";
const BIWEEKLY_ADVANCE = ["Sunday (close day)", "Saturday", "Friday", "Thursday", "Wednesday", "Tuesday", "Monday", "Previous Sunday"];
const BIWEEKLY_DUE = ["Sunday (close day)", "Monday", "Tuesday", "Wednesday"];

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/**
 * Admin-only Settings tab: when payroll reminder emails go out. Times are US
 * Central. Saving shows the next send times so the change can be checked.
 */
export function PayrollCalendarSettings() {
  const [saved, setSaved] = useState<PayrollCalendar | null>(null);
  const [draft, setDraft] = useState<PayrollCalendar | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ calendar: PayrollCalendar; upcoming: Upcoming[] }>("/settings/payroll-calendar")
      .then((data) => { setSaved(data.calendar); setDraft(data.calendar); setUpcoming(data.upcoming); })
      .catch(() => setError("Could not load the payroll calendar."));
  }, []);

  if (!draft || !saved) {
    return <section className="card settings-card" aria-labelledby="payroll-calendar-heading"><h2 id="payroll-calendar-heading">Payroll Calendar</h2>{error ? <p role="alert" className="form-error">{error}</p> : <p role="status">Loading...</p>}</section>;
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const setBiweekly = (patch: Partial<PayrollCalendar["biweekly"]>) => setDraft({ ...draft, biweekly: { ...draft.biweekly, ...patch } });
  const setMonthly = (patch: Partial<PayrollCalendar["monthly"]>) => setDraft({ ...draft, monthly: { ...draft.monthly, ...patch } });

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const data = await api.patch<{ calendar: PayrollCalendar; upcoming: Upcoming[] }>("/settings/payroll-calendar", draft);
      setSaved(data.calendar);
      setDraft(data.calendar);
      setUpcoming(data.upcoming);
      setStatus("Payroll calendar saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the payroll calendar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card settings-card payroll-calendar" onSubmit={save} aria-labelledby="payroll-calendar-heading">
      <h2 id="payroll-calendar-heading">Payroll Calendar</h2>
      <p className="form-help">
        When Talon emails approval reminders. Emails only go to people with something still waiting. Times are US Central.
      </p>

      <ul className="settings-list">
        <li className="settings-list__item">
          <div>
            <label htmlFor="calendar-enabled" className="settings-list__label">Send scheduled reminder emails</label>
            <span id="calendar-enabled-desc" className="form-help">Turning this off stops the automatic emails. Admins can still email supervisors from Time Entry Approvals.</span>
          </div>
          <input id="calendar-enabled" type="checkbox" role="switch" className="settings-switch" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} aria-describedby="calendar-enabled-desc" />
        </li>
      </ul>

      <fieldset className="payroll-calendar__group">
        <legend>Bi-weekly (period closes Sunday)</legend>
        <div className="form-row">
          <label htmlFor="bw-due-day">Approvals due</label>
          <select id="bw-due-day" value={draft.biweekly.dueDaysAfterClose} onChange={(e) => setBiweekly({ dueDaysAfterClose: Number(e.target.value) })}>
            {BIWEEKLY_DUE.map((label, days) => <option key={days} value={days}>{label}</option>)}
          </select>
        </div>
        <DateField id="bw-due-time" type="time" label="Approvals due at" value={draft.biweekly.dueTime} onChange={(dueTime) => setBiweekly({ dueTime })} commitLabel={COMMIT} required />
        <div className="form-row">
          <label htmlFor="bw-advance-day">First reminder day</label>
          <select id="bw-advance-day" value={draft.biweekly.advanceDaysBeforeClose} onChange={(e) => setBiweekly({ advanceDaysBeforeClose: Number(e.target.value) })}>
            {BIWEEKLY_ADVANCE.map((label, days) => <option key={days} value={days}>{label}</option>)}
          </select>
        </div>
        <DateField id="bw-advance-time" type="time" label="First reminder at" value={draft.biweekly.advanceTime} onChange={(advanceTime) => setBiweekly({ advanceTime })} commitLabel={COMMIT} required />
        <DateField id="bw-morning-time" type="time" label="Deadline-day reminder at" value={draft.biweekly.deadlineMorningTime} onChange={(deadlineMorningTime) => setBiweekly({ deadlineMorningTime })} commitLabel={COMMIT} required />
        <DateField id="bw-escalation-time" type="time" label="Deadline-day escalation at" value={draft.biweekly.escalationTime} onChange={(escalationTime) => setBiweekly({ escalationTime })} commitLabel={COMMIT} required />
      </fieldset>

      <fieldset className="payroll-calendar__group">
        <legend>Monthly</legend>
        <div className="form-row">
          <label htmlFor="mo-due-day">Approvals due on day of month</label>
          <input id="mo-due-day" type="number" min={1} max={28} value={draft.monthly.dueDayOfMonth} onChange={(e) => setMonthly({ dueDayOfMonth: Number(e.target.value) })} aria-describedby="mo-due-day-hint" />
          <span id="mo-due-day-hint" className="date-field__hint">1–28. Moves to the Friday before when it falls on a weekend.</span>
        </div>
        <DateField id="mo-due-time" type="time" label="Approvals due at" value={draft.monthly.dueTime} onChange={(dueTime) => setMonthly({ dueTime })} commitLabel={COMMIT} required />
        <div className="form-row">
          <label htmlFor="mo-advance-days">First reminder, business days before</label>
          <input id="mo-advance-days" type="number" min={0} max={10} value={draft.monthly.advanceBusinessDays} onChange={(e) => setMonthly({ advanceBusinessDays: Number(e.target.value) })} />
        </div>
        <DateField id="mo-advance-time" type="time" label="First reminder at" value={draft.monthly.advanceTime} onChange={(advanceTime) => setMonthly({ advanceTime })} commitLabel={COMMIT} required />
        <DateField id="mo-morning-time" type="time" label="Deadline-day reminder at" value={draft.monthly.deadlineMorningTime} onChange={(deadlineMorningTime) => setMonthly({ deadlineMorningTime })} commitLabel={COMMIT} required />
        <DateField id="mo-escalation-time" type="time" label="Deadline-day escalation at" value={draft.monthly.escalationTime} onChange={(escalationTime) => setMonthly({ escalationTime })} commitLabel={COMMIT} required />
      </fieldset>

      {error && <p role="alert" className="form-error">{error}</p>}
      <p role="status" aria-live="polite" className="settings-card__status">{status}</p>
      <div className="button-row">
        <button type="submit" disabled={busy || !changed}>{busy ? "Saving..." : COMMIT}</button>
        {changed && <button type="button" className="button--secondary" onClick={() => setDraft(saved)}>Undo changes</button>}
      </div>

      <h3 className="payroll-calendar__next">Next scheduled emails</h3>
      {!saved.enabled ? <p>Scheduled reminders are off.</p> : upcoming.length === 0 ? <p>No upcoming reminders for open pay periods.</p> : (
        <ul className="payroll-calendar__upcoming">
          {upcoming.map((item) => (
            <li key={`${item.payPeriodId}-${item.stage}`}>
              <strong>{formatWhen(item.at)}</strong> · {STAGE_LABELS[item.stage]} · {item.periodType === "BIWEEKLY" ? "Bi-weekly" : "Monthly"} period ending {new Date(item.periodEnd).toLocaleDateString(undefined, { timeZone: "UTC" })}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
