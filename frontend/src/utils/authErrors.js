// Firebase errors have codes like "auth/weak-password". This turns a code
// (or an error from our own backend) into a sentence a user can understand.
const MESSAGES = {
  "auth/email-already-in-use": "This email is already registered. Try logging in instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem. Check your internet connection.",
  "auth/invalid-phone-number": "That phone number isn't valid.",
  "auth/invalid-verification-code": "That code is wrong. Check it and try again.",
  "auth/missing-verification-code": "Enter the 6-digit code.",
  "auth/code-expired": "That code has expired. Go back and request a new one.",
  "auth/credential-already-in-use": "This phone number is already linked to another account.",
  "auth/captcha-check-failed": "Security check failed. Refresh the page and try again.",
  "auth/quota-exceeded": "Daily SMS limit reached. Use one of the test phone numbers.",
  "auth/operation-not-allowed":
    "Phone sign-in is blocked. In Firebase: Authentication > Settings > SMS region policy, allow India.",
};

export function friendlyError(err) {
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code];
  if (err?.status) return err.message; // an error message from our own backend
  if (err?.message === "Failed to fetch") return "Cannot reach the server. Is the backend running?";
  return `Something went wrong (${err?.code || err?.message || "unknown"}).`;
}
