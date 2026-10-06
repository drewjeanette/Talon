import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import { api } from "../api/client";
import ttuLogo from "../assets/ttu-logo.png";

const MIN_PASSWORD_LENGTH = 12;

export function ResetPasswordPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep the one-time token out of the address bar and browser history.
  useEffect(() => {
    if (searchParams.has("token")) window.history.replaceState(null, "", "/reset-password");
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      // The server signed out every session, including this browser's.
      if (user) await logout();
      navigate("/login", { replace: true, state: { notice: "Your password was reset. Sign in with your new password." } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your password. Try again.");
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="login-page">
      <form onSubmit={handleSubmit} aria-labelledby="reset-heading" className="card login-card">
        <img className="ttu-corner-logo" src={ttuLogo} alt="Tennessee Tech" fetchPriority="high" />
        <h1 id="reset-heading">Reset Password</h1>
        {token ? (
          <>
            <div className="form-row">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-describedby="new-password-help"
              />
              <span id="new-password-help" className="form-help">At least {MIN_PASSWORD_LENGTH} characters.</span>
            </div>
            <div className="form-row">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p role="alert" className="form-error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? "Saving..." : "Reset password"}</button>
          </>
        ) : (
          <p role="alert" className="form-error">This reset link is incomplete. Request a new one.</p>
        )}
        <p className="login-card__links">
          <Link to="/forgot-password">Request a new link</Link>
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  );
}
