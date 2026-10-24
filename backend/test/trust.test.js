// CP5 tests: one-way lock-in, -10 trust for leaving after locking in,
// floor of 0, block at 0, and the automatic reset to 10 when the block ends.
const test = require("node:test");
const assert = require("node:assert");
const h = require("./helpers");

let eventId;

test.before(async () => {
  await h.start();
  await h.cleanTestData();
  eventId = (await h.makeEvent("Trust")).id;
});

test.after(async () => {
  await h.cleanTestData();
  await h.stop();
});

// creator makes a group of 3, joiner joins; returns the group id
async function groupWith(creator, joiner) {
  const g = await h.call("POST", `/events/${eventId}/groups`, { as: creator, body: { max_size: 3 } });
  assert.strictEqual(g.status, 201, JSON.stringify(g.data));
  if (joiner) {
    const j = await h.call("POST", `/groups/${g.data.group.id}/join`, { as: joiner });
    assert.strictEqual(j.status, 200, JSON.stringify(j.data));
  }
  return g.data.group.id;
}

async function trustOf(uid) {
  const r = await h.pool.query("SELECT trust_score, blocked_until FROM users WHERE firebase_uid = $1", [uid]);
  return r.rows[0];
}

test("lock in works once, shows on the member, and can't be repeated", async () => {
  await h.makeUser("test-lock-a");
  await h.makeUser("test-lock-b");
  const gid = await groupWith("test-lock-a", "test-lock-b");

  let r = await h.call("POST", `/groups/${gid}/lock-in`, { as: "test-lock-b" });
  assert.strictEqual(r.status, 200);
  const me = r.data.group.members.find((m) => m.name === "test-lock-b");
  assert.strictEqual(me.is_locked_in, true);

  r = await h.call("POST", `/groups/${gid}/lock-in`, { as: "test-lock-b" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "already_locked_in");
});

test("non-members can't lock in", async () => {
  await h.makeUser("test-lock-out");
  const gid = (await h.pool.query(
    "SELECT g.id FROM groups g JOIN users u ON u.id = g.creator_id WHERE u.firebase_uid = 'test-lock-a'"
  )).rows[0].id;
  const r = await h.call("POST", `/groups/${gid}/lock-in`, { as: "test-lock-out" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "not_member");
});

test("leaving WITHOUT locking in costs nothing", async () => {
  await h.makeUser("test-free-a");
  await h.makeUser("test-free-b");
  const gid = await groupWith("test-free-a", "test-free-b");
  const r = await h.call("POST", `/groups/${gid}/leave`, { as: "test-free-b" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.penalty, 0);
  assert.strictEqual((await trustOf("test-free-b")).trust_score, 30);
});

test("leaving after locking in needs confirm, then costs 10", async () => {
  await h.makeUser("test-pen-a");
  await h.makeUser("test-pen-b");
  const gid = await groupWith("test-pen-a", "test-pen-b");
  await h.call("POST", `/groups/${gid}/lock-in`, { as: "test-pen-b" });

  let r = await h.call("POST", `/groups/${gid}/leave`, { as: "test-pen-b" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "confirm_required");
  assert.strictEqual((await trustOf("test-pen-b")).trust_score, 30, "nothing happened yet");

  r = await h.call("POST", `/groups/${gid}/leave`, { as: "test-pen-b", body: { confirm: true } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.penalty, 10);
  assert.strictEqual(r.data.trust_score, 20);
  assert.strictEqual(r.data.blocked_until, null);

  const note = await h.pool.query(
    "SELECT message FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.firebase_uid = 'test-pen-b'"
  );
  assert.match(note.rows[0].message, /lost 10 trust points/);
});

test("trust never goes below 0, and hitting 0 blocks group actions", async () => {
  await h.makeUser("test-zero-a");
  await h.makeUser("test-zero-b", { trust_score: 5 });
  const gid = await groupWith("test-zero-a", "test-zero-b");
  await h.call("POST", `/groups/${gid}/lock-in`, { as: "test-zero-b" });

  const r = await h.call("POST", `/groups/${gid}/leave`, { as: "test-zero-b", body: { confirm: true } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.trust_score, 0);
  assert.ok(r.data.blocked_until, "blocked_until is set");
  const minutes = (new Date(r.data.blocked_until) - Date.now()) / 60000;
  assert.ok(minutes > 4 && minutes <= 5.1, `block lasts BLOCK_DURATION_MIN (got ${minutes})`);

  // blocked: can still log in and browse...
  assert.strictEqual((await h.call("GET", "/auth/me", { as: "test-zero-b" })).status, 200);
  assert.strictEqual((await h.call("GET", `/events/${eventId}/groups`, { as: "test-zero-b" })).status, 200);
  // ...but can't join or create
  let x = await h.call("POST", `/groups/${gid}/join`, { as: "test-zero-b" });
  assert.strictEqual(x.status, 403);
  assert.strictEqual(x.data.error, "blocked");
  x = await h.call("POST", `/events/${eventId}/groups`, { as: "test-zero-b", body: { max_size: 2 } });
  assert.strictEqual(x.status, 403);
});

test("when the block ends, trust resets to 10 and the user can create groups again", async () => {
  // pretend the 5 minutes have passed
  await h.pool.query(
    "UPDATE users SET blocked_until = now() - interval '1 second' WHERE firebase_uid = 'test-zero-b'"
  );
  const me = await h.call("GET", "/auth/me", { as: "test-zero-b" });
  assert.strictEqual(me.data.user.trust_score, 10);
  assert.strictEqual(me.data.user.blocked_until, null);
  const r = await h.call("POST", `/events/${eventId}/groups`, { as: "test-zero-b", body: { max_size: 2 } });
  assert.strictEqual(r.status, 201);
});

test("can't lock in once booking has started", async () => {
  await h.makeUser("test-seal-a");
  const gid = await groupWith("test-seal-a");
  await h.pool.query("UPDATE groups SET status = 'sealed' WHERE id = $1", [gid]);
  const r = await h.call("POST", `/groups/${gid}/lock-in`, { as: "test-seal-a" });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "group_sealed");
});
