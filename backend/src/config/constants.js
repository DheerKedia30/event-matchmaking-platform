// All "tunable" rules live here, so we can change them in ONE place.
// Times are in minutes. In the real design the block is 7 days,
// but for the demo we shorten it so examiners don't wait a week.
module.exports = {
  MAX_GROUP: 5,              // a group can never have more than 5 people
  MIN_GROUP_TO_BOOK: 2,      // need at least 2 members before booking can start
  START_TRUST: 30,           // every new user starts with this trust score
  LOCKED_LEAVE_PENALTY: 10,  // points lost for leaving after locking in
  TRUST_AFTER_BLOCK: 10,     // trust score reset after a block ends
  BLOCK_DURATION_MIN: 5,     // demo value (real design: 7 days = 10080 minutes)
  PAYMENT_WINDOW_MIN: 10     // time the group has to pay after seats are held
};
