// A timer that checks every 15 seconds for bookings whose payment window has
// run out, and expires them (seats freed, payers refunded, group reopened).
// Bookings are ALSO checked whenever someone opens one, so the page never
// shows a stale "seats held" state even between timer runs.
const pool = require("../db/pool");
const { expireOverdue } = require("./bookingService");
const { emitGroupChanged } = require("../sockets/chatSocket");

const CHECK_EVERY_MS = 15 * 1000;

function startExpiryChecker() {
  const run = () =>
    expireOverdue(pool, (groupId) => emitGroupChanged(groupId)).catch((err) =>
      console.error("Expiry check failed:", err.message)
    );
  run(); // once at startup (catches anything that expired while the server was off)
  return setInterval(run, CHECK_EVERY_MS);
}

module.exports = { startExpiryChecker, CHECK_EVERY_MS };
