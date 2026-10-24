// Trust score rules (locked in the handoff):
//  - everyone starts at START_TRUST (30)
//  - leaving a group after locking in costs LOCKED_LEAVE_PENALTY (10) points
//  - the score never goes below 0
//  - hitting 0 blocks the user from creating/joining groups for BLOCK_DURATION_MIN
//  - when the block ends, the score is reset to TRUST_AFTER_BLOCK (10)
const {
  LOCKED_LEAVE_PENALTY,
  BLOCK_DURATION_MIN,
  TRUST_AFTER_BLOCK,
} = require("../config/constants");

// Takes `points` off a user's trust score inside an open transaction (`db`).
// Returns { trust_score, blocked_until, penalty }.
async function applyPenalty(db, userId, points = LOCKED_LEAVE_PENALTY, reason = "") {
  const r = await db.query(
    `UPDATE users
        SET trust_score = GREATEST(trust_score - $2::int, 0),
            blocked_until = CASE
              WHEN trust_score - $2::int <= 0 THEN now() + make_interval(mins => $3::int)
              ELSE blocked_until END
      WHERE id = $1
      RETURNING trust_score, blocked_until`,
    [userId, points, BLOCK_DURATION_MIN]
  );
  const user = r.rows[0];

  // In-app notification so the user has a record of what happened.
  const message = user.blocked_until
    ? `Your trust score dropped to 0${reason ? ` (${reason})` : ""}. You can't create or join groups until ${new Date(
        user.blocked_until
      ).toLocaleString("en-IN")}.`
    : `You lost ${points} trust points${reason ? ` (${reason})` : ""}. Your trust score is now ${user.trust_score}.`;
  await db.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [userId, message]);

  return { ...user, penalty: points };
}

// If a user's block has run out, lift it and reset the score to TRUST_AFTER_BLOCK.
// Called on every logged-in request (see authMiddleware), so it happens by itself.
// Returns the (possibly updated) user row.
async function liftExpiredBlock(db, user) {
  if (!user.blocked_until || new Date(user.blocked_until) > new Date()) return user;
  const r = await db.query(
    `UPDATE users SET blocked_until = NULL, trust_score = $2
      WHERE id = $1 AND blocked_until IS NOT NULL AND blocked_until <= now()
      RETURNING *`,
    [user.id, TRUST_AFTER_BLOCK]
  );
  if (!r.rows[0]) return user; // someone else already lifted it
  await db.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [
    user.id,
    `Your block has ended. Your trust score was reset to ${TRUST_AFTER_BLOCK}.`,
  ]);
  return r.rows[0];
}

module.exports = { applyPenalty, liftExpiredBlock };
