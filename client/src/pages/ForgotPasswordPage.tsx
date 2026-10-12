import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import { api } from "../api/client";
import ttuLogo from "../assets/ttu-logo.png";

const RESET_LINK_SECONDS = 2 * 60;

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function ForgotPasswordPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(RESET_LINK_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const deadline = expiresAt;

    function updateCountdown() {
      setSecondsRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }

    updateCountdown();
    const timerId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timerId);
  }, [expiresAt]);

  if (user) return <Navigate to="/settings?tab=account" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api.post<{ message: string }>("/auth/forgot-password", { email });
      setSent(data.message);
      setExpiresAt(Date.now() + RESET_LINK_SECONDS * 1000);
      setSecondsRemaining(RESET_LINK_SECONDS);
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
          <>
            <p role="status" className="form-notice">{sent}</p>
            <p
              className="reset-countdown"
              role="timer"
              aria-label={`Time remaining: ${formatCountdown(secondsRemaining)}`}
            >
              Time remaining: <time dateTime={`PT${secondsRemaining}S`}>{formatCountdown(secondsRemaining)}</time>
            </p>
          </>
        ) : (
          <>
            <p>Enter your email and we&apos;ll send you a link to reset your password.</p>
            <div className="form-row">
              <label htmlFor="email">Email</label>
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
