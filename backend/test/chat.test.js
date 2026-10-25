// CP6 tests: live group chat and live group updates over Socket.IO.
// Two "browsers" are real Socket.IO connections, using the same fake Firebase tokens.
const test = require("node:test");
const assert = require("node:assert");
const { io: connect } = require("socket.io-client");
const h = require("./helpers");

let eventId;
let groupId;
const sockets = [];

// Open a live connection as a test user ("tok|<uid>|<email>" is the fake Firebase token)
function open(uid) {
  return new Promise((resolve, reject) => {
    const s = connect(h.url(), {
      auth: { token: `tok|${uid}|${uid}@example.com` },
      transports: ["websocket"],
      reconnection: false,
    });
    sockets.push(s);
    s.on("connect", () => resolve(s));
    s.on("connect_error", (err) => reject(err));
  });
}

// emit with a reply ("ack"), as a promise
const ask = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));

// wait for the next "eventName" on a socket (fails after 2 s)
function next(s, eventName) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${eventName} within 2s`)), 2000);
    s.once(eventName, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

// prove that NOTHING arrives on a socket for a short while
function nothing(s, eventName, ms = 400) {
  return new Promise((resolve, reject) => {
    const handler = (d) => reject(new Error(`unexpected ${eventName}: ${JSON.stringify(d)}`));
    s.once(eventName, handler);
    setTimeout(() => {
      s.off(eventName, handler);
      resolve();
    }, ms);
  });
}

test.before(async () => {
  await h.start();
  await h.cleanTestData();
  eventId = (await h.makeEvent("Chat")).id;
  for (const uid of ["test-chat-a", "test-chat-b", "test-chat-out"]) await h.makeUser(uid);
  const g = await h.call("POST", `/events/${eventId}/groups`, { as: "test-chat-a", body: { max_size: 3 } });
  groupId = g.data.group.id;
  await h.call("POST", `/groups/${groupId}/join`, { as: "test-chat-b" });
});

test.after(async () => {
  sockets.forEach((s) => s.close());
  await h.cleanTestData();
  await h.stop();
});

test("connecting without a valid login is refused", async () => {
  await assert.rejects(
    new Promise((resolve, reject) => {
      const s = connect(h.url(), { auth: { token: "garbage" }, transports: ["websocket"], reconnection: false });
      sockets.push(s);
      s.on("connect", resolve);
      s.on("connect_error", reject);
    }),
    /invalid_token/
  );
});

test("two members see each other's messages instantly", async () => {
  const a = await open("test-chat-a");
  const b = await open("test-chat-b");
  assert.deepStrictEqual(await ask(a, "watch_group", groupId), { ok: true, member: true });
  assert.deepStrictEqual(await ask(b, "watch_group", groupId), { ok: true, member: true });

  const arriving = next(b, "message");
  const sent = await ask(a, "send_message", { groupId, text: "  hey, who's driving?  " });
  assert.strictEqual(sent.ok, true);
  const got = await arriving;
  assert.strictEqual(got.text, "hey, who's driving?"); // trimmed
  assert.strictEqual(got.user_name, "test-chat-a");
});

test("history survives a refresh (saved in the database, oldest first)", async () => {
  const b = await open("test-chat-b");
  await ask(b, "watch_group", groupId);
  await ask(b, "send_message", { groupId, text: "I can!" });
  const r = await h.call("GET", `/groups/${groupId}/messages`, { as: "test-chat-a" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.messages.map((m) => m.text), ["hey, who's driving?", "I can!"]);
});

test("a non-member can't read or post, and doesn't receive messages", async () => {
  const r = await h.call("GET", `/groups/${groupId}/messages`, { as: "test-chat-out" });
  assert.strictEqual(r.status, 403);

  const out = await open("test-chat-out");
  assert.deepStrictEqual(await ask(out, "watch_group", groupId), { ok: true, member: false });
  const sent = await ask(out, "send_message", { groupId, text: "let me in" });
  assert.strictEqual(sent.ok, false);
  assert.strictEqual(sent.error, "not_member");

  const a = await open("test-chat-a");
  await ask(a, "watch_group", groupId);
  const silent = nothing(out, "message");
  await ask(a, "send_message", { groupId, text: "members only" });
  await silent;
});

test("empty and too-long messages are rejected", async () => {
  const a = await open("test-chat-a");
  await ask(a, "watch_group", groupId);
  assert.strictEqual((await ask(a, "send_message", { groupId, text: "   " })).error, "empty");
  assert.strictEqual((await ask(a, "send_message", { groupId, text: "x".repeat(501) })).error, "too_long");
});

test("joining, locking in and leaving push a live update to the group page", async () => {
  const watcher = await open("test-chat-out");
  await ask(watcher, "watch_group", groupId);
  watcher.emit("watch_event", eventId);

  let update = next(watcher, "group_updated");
  let listUpdate = next(watcher, "groups_changed");
  await h.call("POST", `/groups/${groupId}/join`, { as: "test-chat-out" }); // 3/3
  assert.deepStrictEqual(await update, { groupId });
  assert.deepStrictEqual(await listUpdate, { eventId });

  update = next(watcher, "group_updated");
  await h.call("POST", `/groups/${groupId}/lock-in`, { as: "test-chat-b" });
  await update;

  update = next(watcher, "group_updated");
  await h.call("POST", `/groups/${groupId}/leave`, { as: "test-chat-out" });
  await update;
});

test("someone who leaves stops receiving the chat", async () => {
  const leaver = await open("test-chat-out");
  await h.call("POST", `/groups/${groupId}/join`, { as: "test-chat-out" });
  assert.strictEqual((await ask(leaver, "watch_group", groupId)).member, true);

  await h.call("POST", `/groups/${groupId}/leave`, { as: "test-chat-out" });
  await new Promise((r) => setTimeout(r, 100)); // let the server remove them

  const a = await open("test-chat-a");
  await ask(a, "watch_group", groupId);
  const silent = nothing(leaver, "message");
  await ask(a, "send_message", { groupId, text: "after you left" });
  await silent;
});

test("chat closes once the event has ended", async () => {
  await h.pool.query(
    "UPDATE events SET start_time = now() - interval '4 hours', end_time = now() - interval '1 hour' WHERE id = $1",
    [eventId]
  );
  const a = await open("test-chat-a");
  await ask(a, "watch_group", groupId);
  const sent = await ask(a, "send_message", { groupId, text: "great show!" });
  assert.strictEqual(sent.ok, false);
  assert.strictEqual(sent.error, "chat_closed");
  // history can still be read
  assert.strictEqual((await h.call("GET", `/groups/${groupId}/messages`, { as: "test-chat-a" })).status, 200);
});
