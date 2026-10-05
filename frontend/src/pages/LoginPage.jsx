import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { friendlyError } from "../utils/authErrors";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

export default function LoginPage() {
  const { firebaseUser, dbUser, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) return <Loader />;
  // Already logged in? Go home (or finish the signup if the profile is missing)
  if (firebaseUser) return <Navigate to={dbUser ? "/" : "/signup"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password); // then the redirect above kicks in by itself
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card card">
      <h1>Welcome back</h1>
      <p className="muted">Log in to find your crew.</p>

      <form onSubmit={handleSubmit} className="form">
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <Notice type="error">{error}</Notice>}
        <button className="btn" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
      </form>

      <p className="muted small">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  );
}
