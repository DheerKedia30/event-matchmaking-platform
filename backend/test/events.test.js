// CP2 tests: events list, search, category filter, details.
// Needs the 4 seeded events (npm run db:seed). Details are checked on a private
// test event, so real groups or bookings in your database can't break the tests.
const test = require("node:test");
const assert = require("node:assert");
const h = require("./helpers");

test.before(async () => {
  await h.start();
  await h.cleanTestData(); // removes leftovers from any earlier crashed test run
});
test.after(async () => {
  await h.cleanTestData();
  await h.stop();
});

test("list returns the 4 seeded events, soonest first", async () => {
  const r = await h.call("GET", "/events");
  r.data.events = r.data.events.filter((e) => !e.name.startsWith("TEST-"));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.events.length, 4);
  assert.strictEqual(r.data.events[0].name, "Rock Night Live");
  const e = r.data.events[0];
  assert.ok(e.venue_name, "venue name included");
  assert.strictEqual(typeof e.open_groups, "number");
});

test("search 'rock' narrows the list (case does not matter)", async () => {
  const r = await h.call("GET", "/events?q=ROCK");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.events.map((e) => e.name), ["Rock Night Live"]);
});

test("search matching nothing returns an empty list", async () => {
  const r = await h.call("GET", "/events?q=zzzz");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.events.length, 0);
});

test("category filter works and bad category is rejected", async () => {
  let r = await h.call("GET", "/events?category=concert");
  assert.strictEqual(r.data.events.length, 2);
  r = await h.call("GET", "/events?category=concert&q=indie");
  assert.deepStrictEqual(r.data.events.map((e) => e.name), ["Indie Music Fest"]);
  r = await h.call("GET", "/events?category=sports");
  assert.strictEqual(r.status, 400);
});

test("search text cannot break the SQL", async () => {
  const r = await h.call("GET", "/events?q=" + encodeURIComponent("'; DROP TABLE events; --"));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.events.length, 0);
  const again = await h.call("GET", "/events");
  assert.strictEqual(again.data.events.length, 4);
});

test("details include times, price, discount terms and seats left", async () => {
  const ev = await h.makeEvent("Details", {
    base_price: 1500, discount_min_size: 3, discount_percent: 15, rows: 2, perRow: 5,
  });
  const r = await h.call("GET", `/events/${ev.id}`);
  assert.strictEqual(r.status, 200);
  const e = r.data.event;
  assert.ok(e.start_time && e.end_time);
  assert.strictEqual(Number(e.base_price), 1500);
  assert.strictEqual(e.discount_min_size, 3);
  assert.strictEqual(e.discount_percent, 15);
  assert.strictEqual(e.seats_left, 10);
  assert.strictEqual(e.open_groups, 0);
});

test("unknown or bad id gives a clean error", async () => {
  assert.strictEqual((await h.call("GET", "/events/99999")).status, 404);
  assert.strictEqual((await h.call("GET", "/events/abc")).status, 400);
});
