import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { updateProfile } from "../api/authApi";
import { friendlyError } from "../utils/authErrors";
import ProfileForm from "../components/auth/ProfileForm";
import Notice from "../components/shared/Notice";
import { TRUST_AFTER_BLOCK } from "../constants";

export default function ProfilePage() {
  const { dbUser, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const blocked = dbUser.blocked_until && new Date(dbUser.blocked_until) > new Date();

  // Re-check with the server on open: a block may have just ended (trust resets to 10).
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(values) {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await updateProfile(values);
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card card wide">
      <h1>Your profile</h1>
      <p className="muted">{dbUser.email}</p>

      <div className="card-row profile-stats">
        <div className="card">
          <div className="muted small">Trust score</div>
          <div className={`big ${blocked ? "red-text" : "gold-text"}`}>{dbUser.trust_score}</div>
        </div>
        <div className="card">
          <div className="muted small">Peer rating</div>
          <div className="big">
            {dbUser.avg_peer_rating ? `★ ${Number(dbUser.avg_peer_rating).toFixed(1)}` : "–"}
          </div>
        </div>
        <div className="card">
          <div className="muted small">Status</div>
          <div className={blocked ? "red-text" : "green-text"}>
            {blocked ? "Blocked from groups" : dbUser.phone_verified ? "Good standing" : "Phone not verified"}
          </div>
        </div>
      </div>

      {blocked && (
        <Notice type="error">
          Your trust score hit 0 after leaving groups you'd locked in to. You can browse, but you
          can't create or join groups until{" "}
          {new Date(dbUser.blocked_until).toLocaleString("en-IN")}. Your score then resets to{" "}
          {TRUST_AFTER_BLOCK}.
        </Notice>
      )}
      <p className="small muted">
        Your trust score starts at 30. Leaving a group after locking in costs 10 points. Peer
        rating is the average of the stars your groupmates give you after events.
      </p>
      {saved && <Notice type="success">Profile saved.</Notice>}
      <ProfileForm
        initial={dbUser}
        submitLabel="Save changes"
        onSubmit={handleSave}
        busy={busy}
        error={error}
      />
    </div>
  );
}
