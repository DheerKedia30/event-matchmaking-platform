// Connects the React app to YOUR Firebase project.
// The values come from frontend/.env (Vite exposes them as import.meta.env.*)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.error("Firebase settings are missing. Fill in frontend/.env and restart npm run dev.");
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); // the object we use to sign up / log in
