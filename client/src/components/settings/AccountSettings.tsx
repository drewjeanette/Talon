import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const MIN_PASSWORD_LENGTH = 12;

export function AccountSettings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      // The server signs out every session after a password change.
      await logout();
      navigate("/login", { replace: true, state: { notice: "Your password was changed. Sign in with your new password." } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change your password.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card settings-card" aria-labelledby="account-details-heading" role="region">
        <h2 id="account-details-heading">Account Details</h2>
        <dl className="settings-details">
          <dt>Name</dt><dd>{user.firstName} {user.lastName}</dd>
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Role</dt><dd>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</dd>
          <dt>Department</dt><dd>{user.department?.name ?? "Not assigned"}</dd>
        </dl>
        <p className="form-help">Contact an administrator to change these details.</p>
      </div>

      <form className="card settings-card" onSubmit={changePassword} aria-labelledby="change-password-heading">
        <h2 id="change-password-heading">Change Password</h2>
        <div className="form-row">
          <label htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            aria-describedby="new-password-help"
          />
          <span id="new-password-help" className="form-help">At least {MIN_PASSWORD_LENGTH} characters. You&apos;ll be signed out on every device.</span>
        </div>
        <div className="form-row">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Saving..." : "Change password"}</button>
      </form>
    </>
  );
}
