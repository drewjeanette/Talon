import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Legal and accessibility information">
        <Link to="/privacy">Privacy</Link>
        <Link to="/accessibility">Accessibility</Link>
      </nav>
      <p>© {new Date().getFullYear()} Talon</p>
    </footer>
  );
}
