// Seat selection: the group creator picks exactly one seat per member.
// (DFD process 4.2: seats are allocated BEFORE anyone pays.)
// Any free seats are allowed (they don't have to be next to each other).

// Checks the chosen seat ids and locks them, inside a transaction (`db`).
// FOR UPDATE means two groups can never grab the same seat at the same moment:
// the second one waits, then sees the seat is no longer free.
// Returns { seats } on success, or { error: [status, code, message] }.
async function lockChosenSeats(db, eventId, seatIds, count) {
  if (!Array.isArray(seatIds)) {
    return { error: [400, "bad_seats", "Choose your seats first."] };
  }
  const ids = [...new Set(seatIds.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    return { error: [400, "bad_seats", "Invalid seat selection."] };
  }
  if (ids.length !== count) {
    return { error: [400, "wrong_seat_count", `Choose exactly ${count} seats, one for each member.`] };
  }

  const r = await db.query(
    `SELECT id, row_label, seat_no, status FROM seats
      WHERE id = ANY($1::int[]) AND event_id = $2
      ORDER BY row_label, seat_no
      FOR UPDATE`,
    [ids, eventId]
  );
  if (r.rows.length !== count) {
    return { error: [400, "bad_seats", "Some of those seats aren't part of this show."] };
  }
  const taken = r.rows.filter((s) => s.status !== "available");
  if (taken.length) {
    const names = taken.map((s) => `${s.row_label}${s.seat_no}`).join(", ");
    return { error: [409, "seats_taken", `Seat ${names} was just taken by someone else. Please pick again.`] };
  }
  return { seats: r.rows };
}

module.exports = { lockChosenSeats };
