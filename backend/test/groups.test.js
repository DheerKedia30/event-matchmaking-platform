// CP3 tests: create, list, join, full, leave, one-group-per-event, verified/blocked rules.
// Uses its own private test events and "test-" users, and removes them afterwards.
const test = require("node:test");
const assert = require("node:assert");
const h = require("./helpers");

let eventId;      // a private test event
let otherEventId; // a second private test event

test.before(async () => {
  await h.start();
  await h.cleanTestData();
  await h.makeUser("test-a", { name: "Asha", gender: "female" });
  await h.makeUser("test-b", { name: "Bilal", gender: "male" });
  await h.makeUser("test-c", { name: "Chirag", gender: "male" });
  await h.makeUser("test-unverified", { phone_verified: false });
  const blocked = await h.makeUser("test-blocked");
  await h.pool.query(
    "UPDATE users SET trust_score = 0, blocked_until = now() + interval '5 minutes' WHERE id = $1",
    [blocked.id]
  );
  eventId = (await h.makeEvent("Groups A")).id;      // private events: no real groups on them
  otherEventId = (await h.makeEvent("Groups B")).id;
});

test.after(async () => {
  await h.cleanTestData();
  await h.stop();
});

let groupId;

test("must be logged in to see groups", async () => {
  const r = await h.call("GET", `/events/${eventId}/groups`);
  assert.strictEqual(r.status, 401);
});

test("unverified and blocked users cannot create a group", async () => {
  let r = await h.call("POST", `/events/${eventId}/groups`, { as: "test-unverified", body: { max_size: 3 } });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.error, "phone_not_verified");
  r = await h.call("POST", `/events/${eventId}/groups`, { as: "test-blocked", body: { max_size: 3 } });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.error, "blocked");
});

test("size must be 2 to 5", async () => {
  for (const size of [1, 6, "abc", 2.5]) {
    const r = await h.call("POST", `/events/${eventId}/groups`, { as: "test-a", body: { max_size: size } });
    assert.strictEqual(r.status, 400, `size ${size}`);
  }
});

test("A creates a group of 3: count 1/3, 1F, A is a member", async () => {
  const r = await h.call("POST", `/events/${eventId}/groups`, { as: "test-a", body: { max_size: 3 } });
  assert.strictEqual(r.status, 201);
  const g = r.data.group;
  groupId = g.id;
  assert.strictEqual(g.member_count, 1);
  assert.strictEqual(g.max_size, 3);
  assert.strictEqual(g.female_count, 1);
  assert.strictEqual(g.male_count, 0);
  assert.strictEqual(g.is_member, true);
  assert.strictEqual(g.members[0].name, "Asha");
});

test("A cannot create a second group for the same event", async () => {
  const r = await h.call("POST", `/events/${eventId}/groups`, { as: "test-a", body: { max_size: 4 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "already_in_group");
});

test("B sees the group in the list and the event shows 1 open group", async () => {
  const r = await h.call("GET", `/events/${eventId}/groups`, { as: "test-b" });
  assert.strictEqual(r.status, 200);
  const g = r.data.groups.find((x) => x.id === groupId);
  assert.ok(g);
  assert.strictEqual(g.is_member, false);
  assert.strictEqual(r.data.my_group_id, null);
  const ev = await h.call("GET", `/events/${eventId}`);
  assert.strictEqual(ev.data.event.open_groups, 1);
});

test("unverified user cannot join", async () => {
  const r = await h.call("POST", `/groups/${groupId}/join`, { as: "test-unverified" });
  assert.strictEqual(r.status, 403);
});

test("B joins: count 2/3 and 1M 1F; joining twice is refused", async () => {
  let r = await h.call("POST", `/groups/${groupId}/join`, { as: "test-b" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.group.member_count, 2);
  assert.strictEqual(r.data.group.male_count, 1);
  assert.strictEqual(r.data.group.female_count, 1);
  r = await h.call("POST", `/groups/${groupId}/join`, { as: "test-b" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "already_member");
});

test("C joins: group is full (3/3) and no longer counted as open", async () => {
  const r = await h.call("POST", `/groups/${groupId}/join`, { as: "test-c" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.group.is_full, true);
  const ev = await h.call("GET", `/events/${eventId}`);
  assert.strictEqual(ev.data.event.open_groups, 0);
});

test("a 4th person cannot join a full group", async () => {
  await h.makeUser("test-d");
  const r = await h.call("POST", `/groups/${groupId}/join`, { as: "test-d" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "group_full");
});

test("two people racing for the last spot: only one gets in", async () => {
  await h.call("POST", `/groups/${groupId}/leave`, { as: "test-c" }); // 2/3, one spot
  await h.makeUser("test-e");
  const [r1, r2] = await Promise.all([
    h.call("POST", `/groups/${groupId}/join`, { as: "test-d" }),
    h.call("POST", `/groups/${groupId}/join`, { as: "test-e" }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepStrictEqual(statuses, [200, 409]);
  const g = await h.call("GET", `/groups/${groupId}`, { as: "test-a" });
  assert.strictEqual(g.data.group.member_count, 3);
});

test("details show members and the event; anyone logged in can look", async () => {
  const r = await h.call("GET", `/groups/${groupId}`, { as: "test-c" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.event.id, eventId);
  assert.strictEqual(r.data.group.is_member, false);
  assert.strictEqual(r.data.group.members.length, 3);
  assert.ok("trust_score" in r.data.group.members[0]);
});

test("leaving reopens the group; non-members cannot leave", async () => {
  let r = await h.call("POST", `/groups/${groupId}/leave`, { as: "test-c" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "not_member");
  r = await h.call("POST", `/groups/${groupId}/leave`, { as: "test-b" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.group_deleted, false);
  const g = await h.call("GET", `/groups/${groupId}`, { as: "test-a" });
  assert.strictEqual(g.data.group.is_full, false);
});

test("user in a group for one event can still join a group for another event", async () => {
  const r = await h.call("POST", `/events/${otherEventId}/groups`, { as: "test-a", body: { max_size: 2 } });
  assert.strictEqual(r.status, 201);
  const mine = await h.call("GET", "/groups/mine", { as: "test-a" });
  assert.strictEqual(mine.data.groups.length, 2);
});

test("cannot join a sealed group (booking started)", async () => {
  await h.pool.query("UPDATE groups SET status = 'sealed' WHERE id = $1", [groupId]);
  let r = await h.call("POST", `/groups/${groupId}/join`, { as: "test-c" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "group_sealed");
  r = await h.call("POST", `/groups/${groupId}/leave`, { as: "test-a" });
  assert.strictEqual(r.status, 409);
  await h.pool.query("UPDATE groups SET status = 'open' WHERE id = $1", [groupId]);
});

test("when the last member leaves, the group is deleted", async () => {
  // members now: A plus whichever of D/E won the race
  const g = await h.call("GET", `/groups/${groupId}`, { as: "test-a" });
  for (const m of g.data.group.members) {
    const uid = (await h.pool.query("SELECT firebase_uid FROM users WHERE id = $1", [m.id])).rows[0].firebase_uid;
    await h.call("POST", `/groups/${groupId}/leave`, { as: uid });
  }
  const r = await h.call("GET", `/groups/${groupId}`, { as: "test-a" });
  assert.strictEqual(r.status, 404);
});
