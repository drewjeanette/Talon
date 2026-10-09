import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useWorkChanged, waitingFor } from "../lib/work";

export interface TodoItem {
  key: string;
  label: string;
  detail: string;
  count: number;
  target: "approvals" | "payroll" | "report" | "time";
  since: string | null;
}

const LEAVE_MS = 240;

/**
 * The single to-do list. Items come from the server and describe real
 * outstanding work, so opening one never clears it: it leaves (with the
 * completion animation) only after the work itself is done.
 */
export function WorkQueue({ title, className, onOpen, hideWhenEmpty = false }: {
  title: string;
  className: string;
  onOpen: (item: TodoItem) => void;
  /** Students only see the list when they have something to fix. */
  hideWhenEmpty?: boolean;
}) {
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [leaving, setLeaving] = useState<TodoItem[]>([]);
  const [error, setError] = useState(false);
  const previous = useRef<TodoItem[]>([]);

  const load = useCallback(async () => {
    try {
      const next = await api.get<TodoItem[]>("/notifications/todos");
      const gone = previous.current.filter((item) => !next.some((current) => current.key === item.key));
      previous.current = next;
      setItems(next);
      setError(false);
      if (gone.length) {
        setLeaving((current) => [...current, ...gone]);
        window.setTimeout(() => setLeaving((current) => current.filter((item) => !gone.includes(item))), LEAVE_MS);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useWorkChanged(load);

  if (items === null) return error ? <p className="status-message" role="status">Could not load your to-do list.</p> : null;
  const shown = [...items, ...leaving.filter((item) => !items.some((current) => current.key === item.key))];
  if (hideWhenEmpty && shown.length === 0) return null;
  const allClear = shown.length === 0;

  return (
    <section className={`work-queue ${className}${allClear ? " work-queue--complete" : ""}`} aria-labelledby="work-queue-heading">
      <h2 id="work-queue-heading" className="work-queue__title">{title}</h2>
      {allClear ? (
        <div className="work-queue__clear" role="status">
          <span className="work-queue__success" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M14 33l12 12 25-28" /></svg></span>
          <p>All Clear For Now! No Pending Tasks.</p>
        </div>
      ) : (
        <ul className="work-queue__list">
          {shown.map((item) => {
            const isLeaving = !items.some((current) => current.key === item.key);
            const waited = waitingFor(item.since);
            return (
              <li key={item.key} className={`work-queue__item${isLeaving ? " work-queue__item--leaving" : ""}`}>
                <button type="button" className="work-queue__open" onClick={() => onOpen(item)} disabled={isLeaving} aria-describedby={`todo-${item.key}-detail`}>
                  <span className="work-queue__text">
                    <span className="work-queue__label">{item.label}</span>
                    <span id={`todo-${item.key}-detail`} className="work-queue__detail">{item.detail}{waited ? ` Oldest waiting ${waited}.` : ""}</span>
                  </span>
                  <span className="work-queue__count" aria-label={`${item.count} outstanding`}>{item.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite">{leaving.length ? `${leaving.map((item) => item.label).join(", ")} done.` : ""}</p>
    </section>
  );
}
