// A 3-step wizard. The current step is DERIVED from who you are, so if you
// refresh the page halfway, you land on the right step again:
//   not logged in                 -> step 1 (email + password)
//   logged in, no profile yet     -> step 2 (profile + consent)
//   profile saved, phone unverified -> step 3 (OTP)
//   everything done               -> go home
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { registerProfile } from "../api/authApi";
import { friendlyError } from "../utils/authErrors";
import ProfileForm from "../components/auth/ProfileForm";
import PhoneVerify from "../components/auth/PhoneVerify";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

const STEPS = ["Account", "Profile", "Verify phone"];

export default function SignupPage() {
  const { firebaseUser, dbUser, loading, serverError, signup, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) return <Loader />;
  if (dbUser && dbUser.phone_verified) return <Navigate to="/" replace />;
  if (firebaseUser && serverError) return <Notice type="error">{serverError}</Notice>;

  const step = !firebaseUser ? 1 : !dbUser ? 2 : 3;

  async function handleAccount(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signup(email.trim(), password); // creates the Firebase account and logs in
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleProfile(values) {
    setError("");
    setBusy(true);
    try {
      await registerProfile(values); // saves the profile in our database
      await refreshUser();           // reload it, which moves us to step 3
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card card wide">
      <ol className="stepper">
        {STEPS.map((label, i) => (
          <li key={label} className={i + 1 === step ? "active" : i + 1 < step ? "done" : ""}>
            <span>{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <>
          <h1>Create your account</h1>
          <form onSubmit={handleAccount} className="form">
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>Password (at least 6 characters)</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <Notice type="error">{error}</Notice>}
            <button className="btn" disabled={busy}>{busy ? "Creating..." : "Continue"}</button>
          </form>
          <p className="muted small">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Tell us about you</h1>
          <p className="muted">This is how we match you with people going to the same events.</p>
          <ProfileForm
            requireConsent
            submitLabel="Continue"
            onSubmit={handleProfile}
            busy={busy}
            error={error}
          />
        </>
      )}

      {step === 3 && (
        <>
          <h1>Verify your phone</h1>
          <p className="muted">
            For everyone's safety, we confirm each member's number with a one-time code.
          </p>
          <PhoneVerify />
          <button className="link-btn" onClick={() => navigate("/")}>
            Skip for now (you can browse, but not join groups)
          </button>
        </>
      )}
    </div>
  );
}
