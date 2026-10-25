// CP7 tests: creator picks seats once everyone is locked in, split payment, tickets,
// seat-choice checks, failed payment, expiry with auto-refund, sealed group.
const test = require("node:test");
const assert = require("node:assert");
const h = require("./helpers");
const { priceFor } = require("../src/services/bookingService");

// A group of `uids.length` members on a fresh private event. Returns { eventId, groupId }.
async function setup(name, uids, eventOpts = {}) {
  const ev = await h.makeEvent(name, eventOpts);
  for (const uid of uids) await h.makeUser(uid);
  const g = await h.call("POST", `/events/${ev.id}/groups`, { as: uids[0], body: { max_size: 5 } });
  assert.strictEqual(g.status, 201, JSON.stringify(g.data));
  for (const uid of uids.slice(1)) {
    const j = await h.call("POST", `/groups/${g.data.group.id}/join`, { as: uid });
    assert.strictEqual(j.status, 200, JSON.stringify(j.data));
  }
  return { eventId: ev.id, groupId: g.data.group.id };
}

// Every member presses "Lock in"
async function lockAll(groupId, uids) {
  for (const uid of uids) await h.call("POST", `/groups/${groupId}/lock-in`, { as: uid });
}

// Ids of free seats, e.g. freeSeats(id, ["A1","C7"])
async function seatIds(eventId, labels) {
  const r = await h.pool.query(
    "SELECT id, row_label || seat_no AS label FROM seats WHERE event_id = $1 AND row_label || seat_no = ANY($2)",
    [eventId, labels]
  );
  return labels.map((l) => r.rows.find((x) => x.label === l).id);
}

test.before(async () => {
  await h.start();
  await h.cleanTestData();
});
test.after(async () => {
  await h.cleanTestData();
  await h.stop();
});

// ---------- pure logic ----------

test("group discount applies only at the minimum size", () => {
  const ev = { base_price: "1000.00", discount_min_size: 3, discount_percent: 15 };
  assert.deepStrictEqual(
    [priceFor(ev, 2).per_person, priceFor(ev, 2).discount, priceFor(ev, 2).total],
    [1000, 0, 2000]
  );
  assert.deepStrictEqual(
    [priceFor(ev, 3).per_person, priceFor(ev, 3).discount, priceFor(ev, 3).total],
    [850, 450, 2550]
  );
});

// ---------- happy path ----------

let happy;

test("can't start with only 1 member", async () => {
  const s = await setup("Solo", ["test-bk-solo"]);
  await lockAll(s.groupId, ["test-bk-solo"]);
  const r = await h.call("POST", `/groups/${s.groupId}/booking/start`, {
    as: "test-bk-solo", body: { seat_ids: await seatIds(s.eventId, ["A1"]) },
  });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "too_few_members");
});

test("booking needs EVERY member locked in", async () => {
  happy = await setup("Happy", ["test-bk-a", "test-bk-b", "test-bk-c"], {
    base_price: 1000, discount_min_size: 3, discount_percent: 15,
  });
  happy.seats = await seatIds(happy.eventId, ["A1", "C5", "E10"]); // any free seats are fine
  await lockAll(happy.groupId, ["test-bk-a", "test-bk-b"]); // C hasn't locked in
  const r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, {
    as: "test-bk-a", body: { seat_ids: happy.seats },
  });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "not_all_locked_in");
  assert.match(r.data.message, /test-bk-c/);

  const v = await h.call("GET", `/groups/${happy.groupId}/booking`, { as: "test-bk-a" });
  assert.strictEqual(v.data.all_locked_in, false);
  assert.strictEqual(v.data.is_creator, true);
});

test("only the creator can start, with exactly one free seat per member", async () => {
  await lockAll(happy.groupId, ["test-bk-c"]);
  let r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, {
    as: "test-bk-b", body: { seat_ids: happy.seats },
  });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.error, "not_creator");

  r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, {
    as: "test-bk-a", body: { seat_ids: happy.seats.slice(0, 2) },
  });
  assert.strictEqual(r.data.error, "wrong_seat_count");

  r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, { as: "test-bk-a", body: {} });
  assert.strictEqual(r.data.error, "bad_seats");

  // a seat from a different show is refused
  const other = await h.makeEvent("Other");
  const foreign = await seatIds(other.id, ["A1"]);
  r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, {
    as: "test-bk-a", body: { seat_ids: [happy.seats[0], happy.seats[1], foreign[0]] },
  });
  assert.strictEqual(r.data.error, "bad_seats");
});

test("creator's chosen seats are held, the group is sealed, the discount applies", async () => {
  const r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, {
    as: "test-bk-a", body: { seat_ids: happy.seats },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  happy.bookingId = r.data.booking.id;

  assert.strictEqual(r.data.booking.status, "held");
  assert.ok(r.data.booking.seconds_left > 9 * 60, "about 10 minutes to pay");
  assert.strictEqual(r.data.group.status, "sealed");
  assert.strictEqual(r.data.price.per_person, 850);
  assert.strictEqual(Number(r.data.booking.total), 2550);
  assert.strictEqual(Number(r.data.booking.discount), 450);

  assert.deepStrictEqual(
    r.data.seats.map((s) => `${s.row_label}${s.seat_no}`), ["A1", "C5", "E10"], "exactly the chosen seats"
  );
  assert.strictEqual(r.data.my_seat.row_label + r.data.my_seat.seat_no, "A1", "creator gets the first seat");
  assert.strictEqual(r.data.seat_map.filter((s) => s.status === "held").length, 3);
  assert.strictEqual(r.data.payments.length, 3);
  assert.ok(r.data.payments.every((p) => p.status === "pending" && Number(p.amount) === 850));
});

test("once booking starts: no joining, no leaving, no second booking", async () => {
  await h.makeUser("test-bk-late");
  let r = await h.call("POST", `/groups/${happy.groupId}/join`, { as: "test-bk-late" });
  assert.strictEqual(r.status, 409);
  r = await h.call("POST", `/groups/${happy.groupId}/leave`, { as: "test-bk-a" });
  assert.strictEqual(r.status, 409);
  r = await h.call("POST", `/groups/${happy.groupId}/booking/start`, { as: "test-bk-a" });
  assert.strictEqual(r.data.error, "already_started");
});

test("non-members can't see or pay the booking", async () => {
  let r = await h.call("GET", `/groups/${happy.groupId}/booking`, { as: "test-bk-late" });
  assert.strictEqual(r.status, 403);
  r = await h.call("POST", `/bookings/${happy.bookingId}/pay`, { as: "test-bk-late" });
  assert.strictEqual(r.status, 403);
});

test("a declined payment changes nothing and can be retried", async () => {
  const r = await h.call("POST", `/bookings/${happy.bookingId}/pay`, {
    as: "test-bk-a", body: { simulate: "fail" },
  });
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.data.error, "payment_failed");
  const v = await h.call("GET", `/groups/${happy.groupId}/booking`, { as: "test-bk-a" });
  assert.strictEqual(v.data.my_payment.status, "pending");
});

test("each member pays; the last payment confirms and issues one ticket each", async () => {
  let r = await h.call("POST", `/bookings/${happy.bookingId}/pay`, { as: "test-bk-a" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.confirmed, false);
  r = await h.call("POST", `/bookings/${happy.bookingId}/pay`, { as: "test-bk-a" });
  assert.strictEqual(r.data.error, "already_paid");

  await h.call("POST", `/bookings/${happy.bookingId}/pay`, { as: "test-bk-b" });
  r = await h.call("POST", `/bookings/${happy.bookingId}/pay`, { as: "test-bk-c" });
  assert.strictEqual(r.data.confirmed, true);
  assert.strictEqual(r.data.booking.status, "confirmed");
  assert.strictEqual(r.data.group.status, "booked");
  assert.strictEqual(r.data.tickets.length, 3);
  assert.strictEqual(new Set(r.data.tickets.map((t) => t.code)).size, 3, "codes are unique");
  assert.match(r.data.tickets[0].code, /^GP-[0-9A-F]{8}$/);
  assert.strictEqual(r.data.seat_map.filter((s) => s.status === "booked").length, 3);

  const mine = await h.call("GET", "/tickets/mine", { as: "test-bk-b" });
  assert.strictEqual(mine.data.tickets.length, 1);
  assert.strictEqual(mine.data.tickets[0].event_name, "TEST-Happy");
  assert.strictEqual(Number(mine.data.tickets[0].paid), 850);
});

// ---------- unhappy paths ----------

test("choosing a seat someone already has -> clear message, group stays open, nothing held", async () => {
  const s = await setup("Packed", ["test-bk-p1", "test-bk-p2"]);
  await lockAll(s.groupId, ["test-bk-p1", "test-bk-p2"]);
  const [a2, b3] = await seatIds(s.eventId, ["A2", "B3"]);
  await h.pool.query("UPDATE seats SET status = 'booked' WHERE id = $1", [b3]);
  const r = await h.call("POST", `/groups/${s.groupId}/booking/start`, {
    as: "test-bk-p1", body: { seat_ids: [a2, b3] },
  });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "seats_taken");
  assert.match(r.data.message, /B3/);

  const g = await h.call("GET", `/groups/${s.groupId}`, { as: "test-bk-p1" });
  assert.strictEqual(g.data.group.status, "open");
  const held = await h.pool.query("SELECT COUNT(*)::int AS n FROM seats WHERE event_id = $1 AND status = 'held'", [s.eventId]);
  assert.strictEqual(held.rows[0].n, 0);
});

test("payment window runs out -> booking expires, seats freed, payer refunded, group reopens", async () => {
  const s = await setup("Expiry", ["test-bk-e1", "test-bk-e2"]);
  await lockAll(s.groupId, ["test-bk-e1", "test-bk-e2"]);
  const picked = await seatIds(s.eventId, ["D4", "D5"]);
  const start = await h.call("POST", `/groups/${s.groupId}/booking/start`, {
    as: "test-bk-e1", body: { seat_ids: picked },
  });
  const bookingId = start.data.booking.id;
  await h.call("POST", `/bookings/${bookingId}/pay`, { as: "test-bk-e1" }); // e2 never pays

  // pretend the 10 minutes have passed
  await h.pool.query("UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id = $1", [bookingId]);

  const v = await h.call("GET", `/groups/${s.groupId}/booking`, { as: "test-bk-e2" });
  assert.strictEqual(v.data.booking.status, "expired");
  assert.strictEqual(v.data.group.status, "open", "group reopens");
  assert.strictEqual(v.data.seat_map.filter((x) => x.status !== "available").length, 0, "seats freed");
  const p = await h.pool.query("SELECT u.firebase_uid, p.status FROM payments p JOIN users u ON u.id = p.user_id WHERE booking_id = $1", [bookingId]);
  assert.deepStrictEqual(p.rows, [{ firebase_uid: "test-bk-e1", status: "refunded" }]);

  const late = await h.call("POST", `/bookings/${bookingId}/pay`, { as: "test-bk-e2" });
  assert.strictEqual(late.status, 410);

  const note = await h.pool.query(
    "SELECT message FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.firebase_uid = 'test-bk-e1' ORDER BY n.id"
  );
  assert.ok(note.rows.some((n) => /refunded in full/.test(n.message)));

  // ...and the creator can start again (the same seats are free again)
  const again = await h.call("POST", `/groups/${s.groupId}/booking/start`, {
    as: "test-bk-e1", body: { seat_ids: picked },
  });
  assert.strictEqual(again.status, 201);
});

test("two groups picking the same seat at the same moment: only one gets it", async () => {
  const ev = await h.makeEvent("Race", { rows: 1, perRow: 4 });
  const [s1, s2, s3] = await seatIds(ev.id, ["A1", "A2", "A3"]);
  const groups = [];
  for (const pair of [["test-bk-r1", "test-bk-r2"], ["test-bk-r3", "test-bk-r4"]]) {
    for (const uid of pair) await h.makeUser(uid);
    const g = await h.call("POST", `/events/${ev.id}/groups`, { as: pair[0], body: { max_size: 2 } });
    await h.call("POST", `/groups/${g.data.group.id}/join`, { as: pair[1] });
    await lockAll(g.data.group.id, pair);
    groups.push([g.data.group.id, pair[0]]);
  }
  // both want seat A2
  const results = await Promise.all([
    h.call("POST", `/groups/${groups[0][0]}/booking/start`, { as: groups[0][1], body: { seat_ids: [s1, s2] } }),
    h.call("POST", `/groups/${groups[1][0]}/booking/start`, { as: groups[1][1], body: { seat_ids: [s2, s3] } }),
  ]);
  assert.deepStrictEqual(results.map((r) => r.status).sort(), [201, 409]);
});
