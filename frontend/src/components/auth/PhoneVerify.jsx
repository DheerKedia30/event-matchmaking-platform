// Step 3 of signup: prove the phone number with a one-time code (OTP).
// The number is LINKED to the existing Firebase account, so the user keeps
// one account (email + phone) instead of getting a second one.
import { useEffect, useRef, useState } from "react";
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

  // Firebase's invisible "I'm not a robot" check. It can only be drawn ONCE per
  // HTML element, so for every attempt we throw the old one away and draw the
  // new one in a brand-new empty box inside `holderRef`.
  const holderRef = useRef(null);
  const verifierRef = useRef(null);

  function clearVerifier() {
    if (verifierRef.current) {
      try {
        verifierRef.current.clear();
      } catch {
        // already cleared; nothing to do
      }
      verifierRef.current = null;
    }
    if (holderRef.current) holderRef.current.innerHTML = "";
  }

  function newVerifier() {
    clearVerifier();
    const box = document.createElement("div");
    holderRef.current.appendChild(box);
    verifierRef.current = new RecaptchaVerifier(auth, box, { size: "invisible" });
    return verifierRef.current;
  }

  // Clean up when the user leaves this page
  useEffect(() => clearVerifier, []);

  // Tell our backend "phone done", then reload the profile (it flips phone_verified)
  async function finish() {
    await verifyPhone();
    await refreshUser();
  }

  // Has Firebase already got a phone number on this account (an earlier attempt worked)?
  const phoneAlreadyLinked = () =>
    (auth.currentUser?.providerData || []).some((p) => p.providerId === "phone");

  async function sendCode(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{10}$/.test(phone)) return setError("Enter a 10-digit mobile number.");

    setBusy(true);
    try {
      if (phoneAlreadyLinked()) {
        // No new code needed: the phone is already proven. Just finish up.
        await finish();
        return;
      }
      const result = await linkWithPhoneNumber(auth.currentUser, "+91" + phone, newVerifier());
      setConfirmation(result);
    } catch (err) {
      clearVerifier();
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
      clearVerifier();
      await finish(); // our backend double-checks with Firebase
    } catch (err) {
      if (err.code === "auth/provider-already-linked") {
        // The phone got linked already (e.g. Verify was clicked twice). Just finish up.
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
              clearVerifier();
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

      {/* Firebase draws its invisible bot check inside this box (a fresh one per attempt) */}
      <div ref={holderRef} />
    </div>
  );
}
