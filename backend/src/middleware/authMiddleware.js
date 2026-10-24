// Three small "gatekeepers" that run BEFORE a route's main function.
const pool = require("../db/pool");
const firebase = require("../config/firebase");
const { asyncHandler } = require("./errorHandler");
const { liftExpiredBlock } = require("../services/trustService");

// 1) Is there a valid Firebase login token on the request?
//    The frontend sends:  Authorization: Bearer <token>
const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "missing_token", message: "Please log in." });
  }

  try {
    // Firebase checks the signature and expiry. We trust nothing else.
    req.firebase = await firebase.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({
      error: "invalid_token",
      message: "Your session is invalid or expired. Please log in again.",
    });
  }
  next();
});

// 2) Does this Firebase user have a profile row in OUR database?
const loadUser = asyncHandler(async (req, res, next) => {
  const result = await pool.query("SELECT * FROM users WHERE firebase_uid = $1", [
    req.firebase.uid,
  ]);
  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "profile_missing",
      message: "Finish creating your profile first.",
    });
  }
  // If this user's block has run out, lift it now (trust resets to 10).
  req.user = await liftExpiredBlock(pool, result.rows[0]);
  next();
});

// 3) Has the user verified their phone? (needed to join/create groups later)
function requireVerified(req, res, next) {
  if (!req.user.phone_verified) {
    return res.status(403).json({
      error: "phone_not_verified",
      message: "Verify your phone number to do this.",
    });
  }
  next();
}

// 4) Is the user currently blocked (trust score hit 0)? Blocked users can
//    browse, but cannot create or join groups until blocked_until passes.
function requireNotBlocked(req, res, next) {
  const until = req.user.blocked_until;
  if (until && new Date(until) > new Date()) {
    return res.status(403).json({
      error: "blocked",
      message: `Your trust score hit 0, so you can't join or create groups until ${new Date(
        until
      ).toLocaleString("en-IN")}.`,
    });
  }
  next();
}

// "Logged in AND has a profile" = run both gatekeepers in order
const requireAuth = [verifyToken, loadUser];

// Everything needed before creating or joining a group
const requireCanGroup = [...requireAuth, requireVerified, requireNotBlocked];

module.exports = {
  verifyToken, loadUser, requireVerified, requireNotBlocked, requireAuth, requireCanGroup,
};
