import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main id="main-content">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Return to dashboard</Link>
      </p>
    </main>
  );
}
