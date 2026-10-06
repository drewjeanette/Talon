import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

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
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/settings">Settings</NavLink>
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
