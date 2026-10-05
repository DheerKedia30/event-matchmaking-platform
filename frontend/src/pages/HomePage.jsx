// TEMPORARY page for Checkpoint 1. In CP2 this becomes the events list.
// The buttons let you PROVE the login and the phone-verified rule work.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMe, callVerifiedOnly } from "../api/authApi";
import Notice from "../components/shared/Notice";

export default function HomePage() {
  const { dbUser } = useAuth();
  const [result, setResult] = useState(null);

  async function run(label, fn) {
    try {
      const data = await fn();
      setResult({ type: "success", text: `${label}: OK  ${JSON.stringify(data)}` });
    } catch (err) {
      setResult({ type: "error", text: `${label}: ${err.status} ${err.code || ""} - ${err.message}` });
    }
  }

  return (
    <div>
      <h1>Welcome, {dbUser.name}</h1>

      {!dbUser.phone_verified && (
        <Notice type="info">
          Your phone isn't verified yet, so you can browse but not join groups.{" "}
          <Link to="/signup">Verify now</Link>
        </Notice>
      )}

      <div className="card-row">
        <div className="card">
          <div className="muted small">Trust score</div>
          <div className="big gold-text">{dbUser.trust_score}</div>
        </div>
        <div className="card">
          <div className="muted small">Phone</div>
          <div className="big">{dbUser.phone_verified ? "Verified" : "Not verified"}</div>
        </div>
        <div className="card">
          <div className="muted small">Signed in as</div>
          <div>{dbUser.email}</div>
        </div>
      </div>

      <h2>Checkpoint 1 tests</h2>
      <p className="muted">The events list replaces this page in Checkpoint 2.</p>
      <div className="btn-row">
        <button className="btn btn-outline" onClick={() => run("/auth/me", getMe)}>
          Call protected route
        </button>
        <button className="btn btn-outline" onClick={() => run("/auth/verified-only", callVerifiedOnly)}>
          Call verified-only route
        </button>
      </div>
      {result && <Notice type={result.type}>{result.text}</Notice>}
    </div>
  );
}
