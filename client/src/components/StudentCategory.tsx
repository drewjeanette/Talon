import type { ReactNode } from "react";

/** Secondary student tools stay closed until the student chooses a category. */
export function StudentCategory({ title, description, className, children }: {
  title: string;
  description: string;
  className: string;
  children: ReactNode;
}) {
  return <details className={`card student-category ${className}`} aria-label={title}>
    <summary>
      <span className="student-category__label"><strong>{title}</strong><span>{description}</span></span>
      <span className="student-category__arrow" aria-hidden="true">⌄</span>
    </summary>
    <div className="student-category__body">{children}</div>
  </details>;
}
