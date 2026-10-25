// Group booking: start (hold seats), view, pay a share, and list my tickets.
// Locked rules:
//  - only the group CREATOR can start, and only when the group has at least
//    MIN_GROUP_TO_BOOK (2) members and EVERY member has locked in
//  - the creator chooses the seats (any free seats, one per member) BEFORE payment
//  - starting SEALS the group: nobody can join or leave
//  - each member pays their share within PAYMENT_WINDOW_MIN; all paid -> tickets
//  - window runs out -> booking expires, seats freed, payers auto-refunded, group reopens
//  - paying is non-refundable (except the automatic refunds above)
const pool = require("../db/pool");
const { MIN_GROUP_TO_BOOK, PAYMENT_WINDOW_MIN } = require("../config/constants");
const { lockChosenSeats } = require("../services/seatService");
const { gateway } = require("../services/paymentGateway");
const { priceFor, confirmIfAllPaid, expireOverdue } = require("../services/bookingService");
const { emitGroupChanged } = require("../sockets/chatSocket");

function fail(res, status, error, message) {
  return res.status(status).json({ error, message });
}
const parseId = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

async function isMember(db, groupId, userId) {
  const r = await db.query(
    "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]
  );
  return r.rows.length > 0;
}

// Everything the booking page needs, in one object.
async function loadBookingView(db, groupId, userId) {
  const g = await db.query(
    `SELECT g.id, g.status, g.max_size, g.event_id, g.creator_id,
            e.name AS event_name, e.start_time, e.end_time, e.base_price, e.discount_min_size,
            e.discount_percent, e.status AS event_status, v.name AS venue_name,
            (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS member_count
       FROM groups g JOIN events e ON e.id = g.event_id JOIN venues v ON v.id = e.venue_id
      WHERE g.id = $1`,
    [groupId]
  );
  const group = g.rows[0];
  if (!group) return null;

  // The latest booking for this group (any status), if there is one
  const b = await db.query(
    `SELECT id, status, total, discount, hold_expires_at, created_at
       FROM bookings WHERE group_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [groupId]
  );
  const booking = b.rows[0] || null;

  const members = (await db.query(
    `SELECT u.id, u.name, gm.is_locked_in FROM group_members gm JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 ORDER BY gm.joined_at`,
    [groupId]
  )).rows;

  let payments = [];
  let seats = [];
  let tickets = [];
  if (booking) {
    payments = (await db.query(
      `SELECT p.user_id, u.name, p.amount, p.status, p.paid_at
         FROM payments p JOIN users u ON u.id = p.user_id
        WHERE p.booking_id = $1 ORDER BY u.name`,
      [booking.id]
    )).rows;
    seats = (await db.query(
      `SELECT s.id, s.row_label, s.seat_no, bs.user_id, u.name
         FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id LEFT JOIN users u ON u.id = bs.user_id
        WHERE bs.booking_id = $1 ORDER BY s.row_label, s.seat_no`,
      [booking.id]
    )).rows;
    tickets = (await db.query(
      `SELECT t.code, t.user_id, u.name, s.row_label, s.seat_no
         FROM tickets t JOIN seats s ON s.id = t.seat_id JOIN users u ON u.id = t.user_id
        WHERE t.booking_id = $1 ORDER BY s.row_label, s.seat_no`,
      [booking.id]
    )).rows;
  }

  // Whole seat map for the event (to draw the grid); "ours" = held/booked for this booking
  const ourSeatIds = new Set(seats.map((s) => s.id));
  const seatMap = (await db.query(
    "SELECT id, row_label, seat_no, status FROM seats WHERE event_id = $1 ORDER BY row_label, seat_no",
    [group.event_id]
  )).rows.map((s) => ({ ...s, ours: ourSeatIds.has(s.id) }));

  const count = booking ? payments.length || seats.length : group.member_count;
  return {
    group: {
      id: group.id, status: group.status, member_count: group.member_count, max_size: group.max_size,
      creator_id: group.creator_id,
      creator_name: members.find((m) => m.id === group.creator_id)?.name || null,
    },
    members,
    is_creator: group.creator_id === userId,
    all_locked_in: members.length > 0 && members.every((m) => m.is_locked_in),
    event: {
      id: group.event_id, name: group.event_name, venue_name: group.venue_name,
      start_time: group.start_time, end_time: group.end_time, status: group.event_status,
      base_price: group.base_price, discount_min_size: group.discount_min_size,
      discount_percent: group.discount_percent,
    },
    price: priceFor(group, count || group.member_count),
    booking: booking && {
      ...booking,
      seconds_left: Math.max(0, Math.round((new Date(booking.hold_expires_at) - Date.now()) / 1000)),
    },
    payments,
    my_payment: payments.find((p) => p.user_id === userId) || null,
    seats,
    my_seat: seats.find((s) => s.user_id === userId) || null,
    tickets,
    seat_map: seatMap,
    payment_window_min: PAYMENT_WINDOW_MIN,
    min_group_to_book: MIN_GROUP_TO_BOOK,
  };
}

// GET /groups/:id/booking   (members only)
async function getBooking(req, res) {
  const groupId = parseId(req.params.id);
  if (!groupId) return fail(res, 400, "bad_id", "Invalid group id.");
  if (!(await isMember(pool, groupId, req.user.id))) {
    return fail(res, 403, "not_member", "Only group members can see the booking.");
  }
  // If this group's payment window just ran out, expire it now (don't wait for the timer)
  await expireOverdue(pool, (gid) => emitGroupChanged(gid));

  const view = await loadBookingView(pool, groupId, req.user.id);
  if (!view) return fail(res, 404, "group_not_found", "Group not found.");
  res.json(view);
}

// POST /groups/:id/booking/start     body: { seat_ids: [12, 13, 20] }  (one per member)
async function startBooking(req, res) {
  const groupId = parseId(req.params.id);
  if (!groupId) return fail(res, 400, "bad_id", "Invalid group id.");

  const db = await pool.connect();
  let eventId;
  try {
    await db.query("BEGIN");
    // Lock the group so two members pressing "Start booking" together can't create two bookings
    const g = await db.query(
      `SELECT g.*, e.base_price, e.discount_min_size, e.discount_percent, e.start_time,
              e.status AS event_status
         FROM groups g JOIN events e ON e.id = g.event_id WHERE g.id = $1 FOR UPDATE OF g`,
      [groupId]
    );
    const group = g.rows[0];
    let problem = null;
    if (!group) problem = [404, "group_not_found", "Group not found."];
    else if (group.creator_id !== req.user.id) problem = [403, "not_creator", "Only the group creator can choose seats and start booking."];
    else if (group.status !== "open") problem = [409, "already_started", "Booking has already started for this group."];
    else if (group.event_status !== "active") problem = [400, "event_cancelled", "This event was cancelled."];
    else if (new Date(group.start_time) <= new Date()) problem = [400, "event_started", "This event has already started."];
    if (problem) {
      await db.query("ROLLBACK");
      return fail(res, ...problem);
    }
    eventId = group.event_id;

    const members = (await db.query(
      `SELECT gm.user_id, gm.is_locked_in, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = $1 ORDER BY gm.joined_at`,
      [groupId]
    )).rows;
    if (members.length < MIN_GROUP_TO_BOOK) {
      await db.query("ROLLBACK");
      return fail(res, 409, "too_few_members", `You need at least ${MIN_GROUP_TO_BOOK} members to book.`);
    }
    const notLocked = members.filter((m) => !m.is_locked_in);
    if (notLocked.length) {
      await db.query("ROLLBACK");
      return fail(
        res, 409, "not_all_locked_in",
        `Everyone must lock in before booking. Waiting for: ${notLocked.map((m) => m.name).join(", ")}.`
      );
    }

    // 4.2: the creator's chosen seats, checked and locked before anyone pays
    const chosen = await lockChosenSeats(db, group.event_id, req.body?.seat_ids, members.length);
    if (chosen.error) {
      await db.query("ROLLBACK"); // the group was never sealed, so it simply stays open
      return fail(res, ...chosen.error);
    }
    const seats = chosen.seats; // sorted by row and number; members get them in joining order

    // 4.1: create the booking, holding the seats for the payment window
    const price = priceFor(group, members.length);
    const b = await db.query(
      `INSERT INTO bookings (group_id, status, total, discount, hold_expires_at)
       VALUES ($1, 'held', $2, $3, now() + make_interval(mins => $4::int)) RETURNING id`,
      [groupId, price.total, price.discount, PAYMENT_WINDOW_MIN]
    );
    const bookingId = b.rows[0].id;

    for (let i = 0; i < members.length; i++) {
      await db.query("UPDATE seats SET status = 'held' WHERE id = $1", [seats[i].id]);
      await db.query(
        "INSERT INTO booking_seats (booking_id, seat_id, user_id) VALUES ($1, $2, $3)",
        [bookingId, seats[i].id, members[i].user_id]
      );
      // 4.3: one share per member
      await db.query(
        "INSERT INTO payments (booking_id, user_id, amount) VALUES ($1, $2, $3)",
        [bookingId, members[i].user_id, price.per_person]
      );
    }
    await db.query("UPDATE groups SET status = 'sealed' WHERE id = $1", [groupId]);
    for (const m of members) {
      await db.query("INSERT INTO notifications (user_id, message) VALUES ($1, $2)", [
        m.user_id,
        `Booking started! Seats are held for ${PAYMENT_WINDOW_MIN} minutes. Pay your share of ₹${price.per_person}.`,
      ]);
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }

  emitGroupChanged(groupId, eventId); // everyone in the group room moves to "booking in progress"
  res.status(201).json(await loadBookingView(pool, groupId, req.user.id));
}

// POST /bookings/:id/pay   body: { simulate: "success" | "fail" }
async function pay(req, res) {
  const bookingId = parseId(req.params.id);
  if (!bookingId) return fail(res, 400, "bad_id", "Invalid booking id.");

  await expireOverdue(pool, (gid) => emitGroupChanged(gid)); // too late? expire first

  const db = await pool.connect();
  let groupId;
  let confirmed = false;
  try {
    await db.query("BEGIN");
    // Lock the booking: the last two people paying at the same moment can't
    // both "confirm" it, and nobody can pay a booking that just expired.
    const b = await db.query("SELECT * FROM bookings WHERE id = $1 FOR UPDATE", [bookingId]);
    const booking = b.rows[0];
    if (!booking) {
      await db.query("ROLLBACK");
      return fail(res, 404, "booking_not_found", "Booking not found.");
    }
    groupId = booking.group_id;
    if (booking.status === "expired") {
      await db.query("ROLLBACK");
      return fail(res, 410, "booking_expired", "The payment window ran out. Anyone who paid has been refunded.");
    }
    if (booking.status !== "held") {
      await db.query("ROLLBACK");
      return fail(res, 409, "not_payable", `This booking is ${booking.status}.`);
    }

    const p = await db.query(
      "SELECT * FROM payments WHERE booking_id = $1 AND user_id = $2 FOR UPDATE",
      [bookingId, req.user.id]
    );
    const payment = p.rows[0];
    if (!payment) {
      await db.query("ROLLBACK");
      return fail(res, 403, "not_in_booking", "You're not part of this booking.");
    }
    if (payment.status === "paid") {
      await db.query("ROLLBACK");
      return fail(res, 409, "already_paid", "You've already paid your share.");
    }

    const result = await gateway.charge({
      amount: Number(payment.amount), userId: req.user.id, bookingId, simulate: req.body?.simulate,
    });
    if (!result.ok) {
      await db.query("ROLLBACK");
      return fail(res, 402, "payment_failed", `${result.reason} You can try again before the timer runs out.`);
    }

    await db.query("UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1", [payment.id]);
    confirmed = await confirmIfAllPaid(db, bookingId); // 4.4: tickets once everyone has paid
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }

  emitGroupChanged(groupId); // others see "Paid" appear live
  res.json({ confirmed, ...(await loadBookingView(pool, groupId, req.user.id)) });
}

// GET /tickets/mine
async function myTickets(req, res) {
  const r = await pool.query(
    `SELECT t.code, t.issued_at, s.row_label, s.seat_no, b.group_id,
            e.id AS event_id, e.name AS event_name, e.start_time, e.end_time, e.category,
            v.name AS venue_name, v.city AS venue_city, p.amount AS paid,
            (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM tickets t2
               JOIN users u ON u.id = t2.user_id
              WHERE t2.booking_id = t.booking_id AND t2.user_id <> t.user_id) AS with_names
       FROM tickets t
       JOIN bookings b ON b.id = t.booking_id AND b.status = 'confirmed'
       JOIN seats s ON s.id = t.seat_id
       JOIN groups g ON g.id = b.group_id
       JOIN events e ON e.id = g.event_id
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN payments p ON p.booking_id = b.id AND p.user_id = t.user_id
      WHERE t.user_id = $1
      ORDER BY e.start_time`,
    [req.user.id]
  );
  res.json({ tickets: r.rows });
}

module.exports = { getBooking, startBooking, pay, myTickets, loadBookingView };
