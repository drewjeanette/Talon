import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import ttuLogo from "../assets/ttu-logo.png";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const userEditedRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function clearAutofill() {
      const active = document.activeElement;
      if (userEditedRef.current || active === emailRef.current || active === passwordRef.current) return;
      if (emailRef.current) emailRef.current.value = "";
      if (passwordRef.current) passwordRef.current.value = "";
      setEmail("");
      setPassword("");
    }

    clearAutofill();
    const timers = [50, 150, 400, 900, 1600, 2600, 4000].map((delay) => window.setTimeout(clearAutofill, delay));
    window.addEventListener("pageshow", clearAutofill);
    window.addEventListener("focus", clearAutofill);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("pageshow", clearAutofill);
      window.removeEventListener("focus", clearAutofill);
    };
  }, []);

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
      <form onSubmit={handleSubmit} aria-labelledby="login-heading" className="card login-card" autoComplete="off">
        <img className="ttu-corner-logo" src={ttuLogo} alt="Tennessee Tech" fetchPriority="high" />
        <h1 id="login-heading">Talon Sign In</h1>
        {notice && <p role="status" className="form-notice">{notice}</p>}
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            ref={emailRef}
            name="talon-login-email"
            type="email"
            autoComplete="new-password"
            placeholder="name@tntech.edu"
            value={email}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            onChange={(e) => {
              userEditedRef.current = true;
              setEmail(e.target.value);
            }}
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
            ref={passwordRef}
            name="talon-login-password"
            type="password"
            autoComplete="new-password"
            value={password}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            onChange={(e) => {
              userEditedRef.current = true;
              setPassword(e.target.value);
            }}
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
        <p className="login-card__links"><Link to="/forgot-password">Forgot password?</Link></p>
      </form>
    </main>
  );
}
