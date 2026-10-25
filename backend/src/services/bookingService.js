// Shared booking rules, used by the booking pages, the expiry timer and the admin.
//
// Life of a booking (DFD level 2, processes 4.1 to 4.4):
//   held      -> the creator's chosen seats are reserved; each member pays before hold_expires_at
//   confirmed -> everyone paid: seats booked, one ticket per member
//   expired   -> the payment window ran out: seats freed, payers refunded, group reopens
//   cancelled -> the organiser cancelled the event: everyone who paid is refunded
const crypto = require("crypto");
const { gateway } = require("./paymentGateway");

// Price per person and totals for a group of `count` people.
// The group discount applies only when the group is big enough.
function priceFor(event, count) {
  const base = Number(event.base_price);
  const discounted = count >= event.discount_min_size;
  const perPerson = discounted
    ? Math.round(base * (100 - event.discount_percent)) / 100
    : base;
  const total = Math.round(perPerson * count * 100) / 100;
  const fullPrice = Math.round(base * count * 100) / 100;
  return {
    base_price: base,
    per_person: perPerson,
    total,
    discount: Math.round((fullPrice - total) * 100) / 100,
    discount_applied: discounted,
    discount_percent: discounted ? event.discount_percent : 0,
  };
}

// e.g. "GP-7F3A9C2D"
function ticketCode() {
  return `GP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function notify(db, userIds, message) {
  for (const id of userIds) {
    await db.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [id, message]);
  }
}

// If every member has paid: confirm the booking, mark seats booked, issue tickets.
// Runs inside the caller's transaction. Returns true if it confirmed.
async function confirmIfAllPaid(db, bookingId) {
  const p = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status <> 'paid')::int AS unpaid FROM payments WHERE booking_id = $1`,
    [bookingId]
  );
  if (p.rows[0].unpaid > 0) return false;

  const b = await db.query(
    "UPDATE bookings SET status = 'confirmed' WHERE id = $1 AND status = 'held' RETURNING group_id",
    [bookingId]
  );
  if (!b.rows[0]) return false; // already confirmed by someone else

  await db.query(
    `UPDATE seats SET status = 'booked'
      WHERE id IN (SELECT seat_id FROM booking_seats WHERE booking_id = $1)`,
    [bookingId]
  );
  const seats = await db.query(
    "SELECT seat_id, user_id FROM booking_seats WHERE booking_id = $1", [bookingId]
  );
  for (const s of seats.rows) {
    await db.query(
      "INSERT INTO tickets (booking_id, user_id, seat_id, code) VALUES ($1, $2, $3, $4)",
      [bookingId, s.user_id, s.seat_id, ticketCode()]
    );
  }
  await db.query("UPDATE groups SET status = 'booked' WHERE id = $1", [b.rows[0].group_id]);
  await notify(db, seats.rows.map((s) => s.user_id), "Everyone paid! Your tickets are ready in My tickets.");
  return true;
}

// Undo a booking: free its seats, refund everyone who paid, reopen (or keep) the group.
//   newStatus = 'expired'   (payment window ran out)  -> group reopens so members can try again
//   newStatus = 'cancelled' (organiser cancelled)      -> group stays closed
// Runs inside the caller's transaction. Returns { refunded: [userIds], amount }.
async function releaseBooking(db, bookingId, newStatus, reason) {
  const b = await db.query(
    `UPDATE bookings SET status = $2
      WHERE id = $1 AND status IN ('held', 'confirmed') RETURNING group_id`,
    [bookingId, newStatus]
  );
  if (!b.rows[0]) return { refunded: [], amount: 0 }; // already released
  const groupId = b.rows[0].group_id;

  await db.query(
    `UPDATE seats SET status = 'available'
      WHERE id IN (SELECT seat_id FROM booking_seats WHERE booking_id = $1)`,
    [bookingId]
  );
  await db.query("DELETE FROM tickets WHERE booking_id = $1", [bookingId]);

  // Auto-refund: only people who actually paid get money back
  const paid = await db.query(
    "SELECT id, user_id, amount FROM payments WHERE booking_id = $1 AND status = 'paid'",
    [bookingId]
  );
  let amount = 0;
  for (const p of paid.rows) {
    await gateway.refund({ amount: Number(p.amount), paymentId: p.id });
    await db.query("UPDATE payments SET status = 'refunded' WHERE id = $1", [p.id]);
    amount += Number(p.amount);
  }
  // Nobody owes anything any more
  await db.query("DELETE FROM payments WHERE booking_id = $1 AND status = 'pending'", [bookingId]);

  await db.query("UPDATE groups SET status = $2 WHERE id = $1", [
    groupId, newStatus === "expired" ? "open" : "sealed",
  ]);

  const members = await db.query("SELECT user_id FROM group_members WHERE group_id = $1", [groupId]);
  const refundedIds = paid.rows.map((p) => p.user_id);
  await notify(db, members.rows.map((m) => m.user_id), reason);
  await notify(db, refundedIds, "Your payment has been refunded in full.");

  return { groupId, refunded: refundedIds, amount: Math.round(amount * 100) / 100 };
}

// Find held bookings whose payment window has passed and expire them.
// Called by the timer in bookingExpiry.js, and whenever someone opens a booking.
async function expireOverdue(pool, onChanged = () => {}) {
  const due = await pool.query(
    "SELECT id FROM bookings WHERE status = 'held' AND hold_expires_at <= now()"
  );
  let count = 0;
  for (const { id } of due.rows) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const lock = await db.query(
        "SELECT id FROM bookings WHERE id = $1 AND status = 'held' AND hold_expires_at <= now() FOR UPDATE",
        [id]
      );
      if (!lock.rows[0]) {
        await db.query("ROLLBACK");
        continue;
      }
      const res = await releaseBooking(
        db, id, "expired",
        "Not everyone paid in time, so the booking was cancelled and the seats were released. Anyone who paid has been refunded. Your group is open again."
      );
      await db.query("COMMIT");
      count += 1;
      onChanged(res.groupId);
    } catch (err) {
      await db.query("ROLLBACK");
      console.error("Expiring booking", id, "failed:", err.message);
    } finally {
      db.release();
    }
  }
  return count;
}

module.exports = { priceFor, confirmIfAllPaid, releaseBooking, expireOverdue, ticketCode };
