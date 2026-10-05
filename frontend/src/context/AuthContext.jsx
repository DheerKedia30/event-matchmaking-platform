// "Context" = data any component can read without passing props down.
// Here it holds WHO is logged in:
//   firebaseUser = the Firebase account (email, login token)
//   dbUser       = our database profile (name, trust score, phone_verified ...)
import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { getMe } from "../api/authApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState("");

  // Ask our backend for this user's profile
  async function refreshUser() {
    try {
      const { user } = await getMe();
      setDbUser(user);
      setServerError("");
      return user;
    } catch (err) {
      if (err.status === 404) {
        // Logged in to Firebase but no profile yet: normal in the middle of signup
        setDbUser(null);
        setServerError("");
        return null;
      }
      setServerError(err.status ? err.message : "Cannot reach the server. Is the backend running?");
      return null;
    }
  }

  // Firebase tells us whenever someone logs in or out (and once at page load)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setLoading(true); // hold the screen until we know the profile
        await refreshUser();
      } else {
        setDbUser(null);
        setServerError("");
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    firebaseUser,
    dbUser,
    loading,
    serverError,
    refreshUser,
    signup: (email, password) => createUserWithEmailAndPassword(auth, email, password),
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Any component calls useAuth() to read the values above
export function useAuth() {
  return useContext(AuthContext);
}
