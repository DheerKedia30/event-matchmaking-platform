// Step 3 of signup: prove the phone number with a one-time code (OTP).
// The number is LINKED to the existing Firebase account, so the user keeps
// one account (email + phone) instead of getting a second one.
import { useState } from "react";
import { RecaptchaVerifier, linkWithPhoneNumber } from "firebase/auth";
import { auth } from "../../firebase";
import { verifyPhone } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { friendlyError } from "../../utils/authErrors";
import Notice from "../shared/Notice";

export default function PhoneVerify() {
  const { refreshUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null); // set after the code is sent
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Tell our backend "phone done", then reload the profile (it flips phone_verified)
  async function finish() {
    await verifyPhone();
    await refreshUser();
  }

  async function sendCode(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{10}$/.test(phone)) return setError("Enter a 10-digit mobile number.");

    setBusy(true);
    // Invisible reCAPTCHA: a hidden bot check Firebase requires before sending an SMS
    const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    try {
      const result = await linkWithPhoneNumber(auth.currentUser, "+91" + phone, verifier);
      setConfirmation(result);
    } catch (err) {
      verifier.clear();
      if (err.code === "auth/provider-already-linked") {
        // Phone was already linked earlier (e.g. server was down). Just finish up.
        try {
          await finish();
        } catch (e2) {
          setError(friendlyError(e2));
        }
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await confirmation.confirm(code); // Firebase checks the code
      await finish();                   // our backend double-checks with Firebase
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      {!confirmation ? (
        <form onSubmit={sendCode} className="form">
          <label className="field">
            <span>Mobile number</span>
            <div className="phone-row">
              <span className="phone-prefix">+91</span>
              <input
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="9999999999"
              />
            </div>
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Sending..." : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={checkCode} className="form">
          <Notice type="info">Code sent to +91 {phone}. Enter the 6-digit code below.</Notice>
          <label className="field">
            <span>Verification code</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Checking..." : "Verify"}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setConfirmation(null);
              setCode("");
              setError("");
            }}
          >
            Use a different number
          </button>
        </form>
      )}

      {error && <Notice type="error">{error}</Notice>}

      {/* Firebase draws its invisible bot check inside this empty box */}
      <div id="recaptcha-container" />
    </div>
  );
}
