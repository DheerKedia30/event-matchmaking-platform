import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const { firebaseUser, dbUser, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  // "Dheer Kedia" -> "DK"
  const initials = dbUser
    ? dbUser.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "";

  return (
    <header className="navbar">
      <Link to="/" className="logo">GroupPass</Link>

      <nav className="nav-links">
        {dbUser && (
          <>
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </>
        )}
      </nav>

      <div className="nav-right">
        {dbUser ? (
          <>
            <span className="chip gold">Trust {dbUser.trust_score}</span>
            <span className="avatar">{initials}</span>
            <button className="link-btn" onClick={handleLogout}>Log out</button>
          </>
        ) : firebaseUser ? (
          <button className="link-btn" onClick={handleLogout}>Log out</button>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/signup" className="btn btn-small">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}
