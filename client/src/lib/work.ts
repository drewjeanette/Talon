import { useEffect, useRef } from "react";

// Tells the to-do list that work was done somewhere on the page (an approval,
// a generated period), so it re-checks what is still outstanding.
const EVENT = "talon:work-changed";

export function notifyWorkChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Runs `callback` when work changes on the page. With `poll`, also every
 * minute and when the tab regains focus, to pick up work done elsewhere.
 */
export function useWorkChanged(callback: () => void, { poll = true } = {}) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const run = () => latest.current();
    window.addEventListener(EVENT, run);
    if (!poll) return () => window.removeEventListener(EVENT, run);
    const timer = window.setInterval(run, 60_000);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(EVENT, run);
      window.removeEventListener("focus", run);
    };
  }, [poll]);
}

/** "3 hours", "2 days": how long something has been waiting. */
export function waitingFor(since: string | Date | null | undefined, now = Date.now()): string | null {
  if (!since) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** Saves a downloaded file (CSV, PDF) in the same window. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
