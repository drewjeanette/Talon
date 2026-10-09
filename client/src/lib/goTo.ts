import type { TodoItem } from "../components/WorkQueue";

/** Where each kind of to-do is done on the dashboard. */
const TODO_ANCHORS: Record<string, string> = {
  "time-entries": "#approvals-heading",
  corrections: "#approvals-heading",
  "pay-stubs": "#team-paystubs-heading",
  "stub-questions": "#team-paystubs-heading",
  "report-ready": "#report-heading",
  generate: "#pay-period-heading",
  finalize: "#pay-period-heading",
  "rejected-time": "#time-help-heading",
};

/** Scrolls to and focuses a heading, once it has rendered. */
export function goTo(selector: string) {
  window.requestAnimationFrame(() => {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
  });
}

export function goToTodo(item: TodoItem) {
  goTo(TODO_ANCHORS[item.key] ?? "#main-content");
}
