import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import ttuLogo from "../assets/ttu-logo.png";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="login-page">
      <form onSubmit={handleSubmit} aria-labelledby="login-heading" className="card login-card">
        <img className="ttu-corner-logo" src={ttuLogo} alt="Tennessee Tech" fetchPriority="high" />
        <h1 id="login-heading">Talon Sign In</h1>
        <p>Tennessee Tech Payroll &amp; Web Clock</p>
        <div className="form-row">
          <label htmlFor="email">TN Tech email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="name@tntech.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            pattern="[^@ ]+@tntech[.]edu"
            title="Use your @tntech.edu email address"
            required
            aria-describedby="email-help"
          />
          <span id="email-help" className="form-help">Use your @tntech.edu email address.</span>
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
