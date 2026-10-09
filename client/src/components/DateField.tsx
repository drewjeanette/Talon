import { useId } from "react";

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "date" for a day, "datetime-local" for a day and time, "time" for a time of day. */
  type?: "date" | "datetime-local" | "time";
  /** The button that saves the form, named in the hint so the commit step is always the same. */
  commitLabel: string;
  required?: boolean;
  min?: string;
  max?: string;
  id?: string;
}

/**
 * The one date/time picker used across Talon. Every picker behaves the same:
 * type the value or choose it from the calendar, and nothing is saved until
 * the form's button is pressed. Values never commit on blur or Enter alone.
 */
export function DateField({ label, value, onChange, type = "date", commitLabel, required, min, max, id }: DateFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  return (
    <div className="form-row date-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type={type}
        value={value}
        min={min}
        max={max}
        required={required}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={hintId} className="date-field__hint">
        {type === "date" ? "MM/DD/YYYY" : type === "time" ? "Time (HH:MM AM/PM)" : "MM/DD/YYYY, time"}. Saved when you select “{commitLabel}”.
      </span>
    </div>
  );
}
