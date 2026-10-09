import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!user && !loading) return null;

  if (loading) {
    return (
      <header className="app-header app-header--loading" aria-hidden="true">
        <div className="app-header__brand"><span>🦅</span> Talon</div>
      </header>
    );
  }

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span aria-hidden="true">🦅</span> Talon
      </div>
      <nav aria-label="Primary" className="app-header__nav">
        {user.role === "ADMIN" || pathname !== "/"
          ? <Link to="/">Dashboard</Link>
          : <span className="app-header__dashboard-label" aria-current="page">Dashboard</span>}
      </nav>
      <div className="app-header__user">
        <span className="app-header__name">
          {user.preferredName || user.firstName} &middot; {user.role === "ADMIN"
            ? user.role
            : <strong className="app-header__role">{user.role}</strong>}
        </span>
        <NavLink to="/settings" className="app-header__settings" aria-label="Settings" title="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </NavLink>
        <button type="button" onClick={handleLogout} className="app-header__logout">
          Log out
        </button>
      </div>
    </header>
  );
}
