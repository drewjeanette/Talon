import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        {user.role === "ADMIN"
          ? <Link to="/">Dashboard</Link>
          : <span className="app-header__dashboard-label" aria-current="page">Dashboard</span>}
      </nav>
      <div className="app-header__user">
        <span className="app-header__name">
          {user.firstName} &middot; {user.role === "ADMIN"
            ? user.role
            : <strong className="app-header__role">{user.role}</strong>}
        </span>
        <button type="button" onClick={handleLogout} className="app-header__logout">
          Log out
        </button>
      </div>
    </header>
  );
}
