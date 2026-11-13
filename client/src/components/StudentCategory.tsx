import type { MouseEvent, ReactNode } from "react";

function backToOverview(event: MouseEvent<HTMLButtonElement>) {
  const category = event.currentTarget.closest<HTMLDetailsElement>("details.student-category");
  if (!category) return;

  category.open = false;
  const firstSummary = category.parentElement?.querySelector<HTMLElement>(".student-category > summary");
  firstSummary?.focus({ preventScroll: true });
  firstSummary?.scrollIntoView({ block: "start" });
}

/** Secondary student tools stay closed until the student chooses a category. */
export function StudentCategory({ title, description, className, children }: {
  title: string;
  description: string;
  className: string;
  children: ReactNode;
}) {
  return <details name="student-categories" className={`card student-category ${className}`} aria-label={title}>
    <summary>
      <span className="student-category__label"><strong>{title}</strong><span>{description}</span></span>
      <span className="student-category__arrow" aria-hidden="true">⌄</span>
    </summary>
    <div className="student-category__body">
      <div className="student-category__actions">
        <button type="button" onClick={backToOverview}>Back to Overview</button>
      </div>
      {children}
    </div>
  </details>;
}
