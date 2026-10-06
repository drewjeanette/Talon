import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import { api } from "../api/client";
import ttuLogo from "../assets/ttu-logo.png";

export function ForgotPasswordPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/settings?tab=account" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api.post<{ message: string }>("/auth/forgot-password", { email });
      setSent(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="login-page">
      <form onSubmit={handleSubmit} aria-labelledby="forgot-heading" className="card login-card">
        <img className="ttu-corner-logo" src={ttuLogo} alt="Tennessee Tech" fetchPriority="high" />
        <h1 id="forgot-heading">Forgot Password</h1>
        {sent ? (
          <p role="status" className="form-notice">{sent} The link expires in 30 minutes.</p>
        ) : (
          <>
            <p>Enter your TN Tech email and we&apos;ll send you a link to reset your password.</p>
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
              />
            </div>
            {error && <p role="alert" className="form-error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
          </>
        )}
        <p className="login-card__links"><Link to="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
