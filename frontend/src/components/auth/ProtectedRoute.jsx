// Wraps pages that need a login. Sends visitors to the right place if not.
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Loader from "../shared/Loader";
import Notice from "../shared/Notice";

export default function ProtectedRoute({ children }) {
  const { firebaseUser, dbUser, loading, serverError } = useAuth();

  if (loading) return <Loader />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (serverError) return <Notice type="error">{serverError}</Notice>;
  if (!dbUser) return <Navigate to="/signup" replace />; // logged in but profile not finished

  // Note: phone verification is NOT checked here. Unverified users may browse.
  // It is checked when they try to join or create a group (backend + banner).
  return children;
}
