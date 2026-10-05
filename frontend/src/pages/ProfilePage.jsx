import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { updateProfile } from "../api/authApi";
import { friendlyError } from "../utils/authErrors";
import ProfileForm from "../components/auth/ProfileForm";
import Notice from "../components/shared/Notice";

export default function ProfilePage() {
  const { dbUser, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

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
