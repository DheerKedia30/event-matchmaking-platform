// Sets up the Firebase "Admin" connection. The backend uses it to check that
// a login token really came from Firebase, and to read a user's verified phone.
// It needs the secret key file you downloaded: backend/firebase-service-account.json
const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const keyPath =
  process.env.FIREBASE_KEY_PATH ||
  path.join(__dirname, "..", "..", "firebase-service-account.json");

if (!fs.existsSync(keyPath)) {
  throw new Error(
    `Firebase key file not found at: ${keyPath}\n` +
      "Put your downloaded key in the backend folder and name it firebase-service-account.json"
  );
}

// Start Firebase only once, even if this file is loaded twice
if (getApps().length === 0) {
  initializeApp({ credential: cert(require(keyPath)) });
}

// Other files call firebase.auth() to get the Firebase Auth tools.
module.exports = { auth: () => getAuth() };
