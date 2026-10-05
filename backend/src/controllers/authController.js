const pool = require("../db/pool");
const firebase = require("../config/firebase");
const { MIN_AGE, MAX_AGE } = require("../config/constants");
const { asyncHandler } = require("../middleware/errorHandler");

const GENDERS = ["male", "female", "other"];

// Turns ["Rock", " rock ", "Indie"] into ["rock", "indie"]; returns null if invalid
function cleanList(value) {
  if (!Array.isArray(value)) return null;
  const items = [
    ...new Set(value.map((v) => String(v).trim().toLowerCase()).filter(Boolean)),
  ];
  if (items.length === 0 || items.length > 10 || items.some((i) => i.length > 30)) {
    return null;
  }
  return items;
}

// Never trust the browser: check every profile field again on the server
function validateProfile(body) {
  const name = String(body.name ?? "").trim();
  const age = Number(body.age);
  const gender = body.gender;
  const languages = cleanList(body.languages);
  const interests = cleanList(body.interests);

  if (name.length < 2 || name.length > 60) return { error: "Name must be 2 to 60 characters." };
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    return { error: `Age must be a whole number from ${MIN_AGE} to ${MAX_AGE}.` };
  }
  if (!GENDERS.includes(gender)) return { error: "Pick male, female or other." };
  if (!languages) return { error: "Pick between 1 and 10 languages." };
  if (!interests) return { error: "Pick between 1 and 10 interests." };

  return { value: { name, age, gender, languages, interests } };
}

// Only send safe fields back to the browser
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    phone_verified: row.phone_verified,
    role: row.role,
    gender: row.gender,
    age: row.age,
    languages: row.languages,
    interests: row.interests,
    trust_score: row.trust_score,
    avg_peer_rating: row.avg_peer_rating,
    blocked_until: row.blocked_until,
  };
}

// POST /auth/register  - create the profile row after Firebase signup
const register = asyncHandler(async (req, res) => {
  const { value, error } = validateProfile(req.body);
  if (error) return res.status(400).json({ error: "invalid_profile", message: error });

  if (req.body.consent !== true) {
    return res.status(400).json({
      error: "consent_required",
      message: "You must agree to share your details for matching.",
    });
  }

  const email = req.firebase.email;
  if (!email) {
    return res.status(400).json({ error: "no_email", message: "Your account has no email." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users
         (firebase_uid, name, email, gender, age, languages, interests, consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (firebase_uid) DO NOTHING
       RETURNING *`,
      [req.firebase.uid, value.name, email, value.gender, value.age, value.languages, value.interests]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: "profile_exists", message: "Profile already exists." });
    }
    res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    if (err.code === "23505") {
      // unique violation: this email already belongs to another profile
      return res.status(409).json({ error: "email_taken", message: "This email is already in use." });
    }
    throw err;
  }
});

// GET /auth/me  - who am I?
const me = (req, res) => {
  res.json({ user: publicUser(req.user) });
};

// POST /auth/verify-phone
// The browser says "I entered the OTP". We do NOT take its word for it:
// we ask Firebase directly whether this account now has a verified phone.
const verifyPhone = asyncHandler(async (req, res) => {
  const record = await firebase.auth().getUser(req.firebase.uid);
  if (!record.phoneNumber) {
    return res.status(400).json({
      error: "phone_not_linked",
      message: "No verified phone number found on your account yet.",
    });
  }
  const result = await pool.query(
    "UPDATE users SET phone = $1, phone_verified = TRUE WHERE id = $2 RETURNING *",
    [record.phoneNumber, req.user.id]
  );
  res.json({ user: publicUser(result.rows[0]) });
});

// PUT /auth/profile  - edit name, age, gender, languages, interests
const updateProfile = asyncHandler(async (req, res) => {
  const { value, error } = validateProfile(req.body);
  if (error) return res.status(400).json({ error: "invalid_profile", message: error });

  const result = await pool.query(
    `UPDATE users
        SET name = $1, age = $2, gender = $3, languages = $4, interests = $5
      WHERE id = $6
      RETURNING *`,
    [value.name, value.age, value.gender, value.languages, value.interests, req.user.id]
  );
  res.json({ user: publicUser(result.rows[0]) });
});

// GET /auth/verified-only  - a test route that only phone-verified users can open
const verifiedOnly = (req, res) => {
  res.json({ ok: true, message: `Hello ${req.user.name}, your phone is verified.` });
};

module.exports = { register, me, verifyPhone, updateProfile, verifiedOnly };
