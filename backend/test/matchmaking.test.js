// CP4 tests: Node asks the matchmaking service to rank groups, and falls back
// to an unranked list if that service is down.
// A tiny FAKE matchmaking server is started here, so these tests do not need
// Python running. (Python's own scoring has its own tests in matchmaking-service.)
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const h = require("./helpers");

let fake;          // the fake matchmaking server
let lastRequest;   // what Node sent to it
let eventId;
const ids = {};    // group ids by name

// Fake scorer: score = 100 - 10 * (position of the group id in "preferred").
let preferred = [];
function startFake() {
  return new Promise((resolve) => {
    fake = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        lastRequest = JSON.parse(body);
        const ranked = lastRequest.groups.map((g) => ({
          group_id: g.id,
          score: 100 - 10 * Math.max(0, preferred.indexOf(g.id)),
          breakdown: { interests: 1, reputation: 1, preferences: 1, size_fit: 1 },
          shared_interests: ["rock"],
        }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ranked }));
      });
    });
    fake.listen(0, () => resolve(`http://localhost:${fake.address().port}`));
  });
}

test.before(async () => {
  await h.start();
  await h.cleanTestData();
  process.env.MATCHMAKING_URL = await startFake();
  for (const uid of ["test-m1", "test-m2", "test-m3", "test-viewer"]) await h.makeUser(uid);
  eventId = (await h.makeEvent("Matchmaking")).id; // private event: no real groups on it
  // m1: group of 3 (joinable), m2: group of 2 (joinable), m3: group of 2 that we fill up
  ids.g1 = (await h.call("POST", `/events/${eventId}/groups`, { as: "test-m1", body: { max_size: 3 } })).data.group.id;
  ids.g2 = (await h.call("POST", `/events/${eventId}/groups`, { as: "test-m2", body: { max_size: 2 } })).data.group.id;
  ids.full = (await h.call("POST", `/events/${eventId}/groups`, { as: "test-m3", body: { max_size: 2 } })).data.group.id;
  await h.makeUser("test-m4");
  await h.call("POST", `/groups/${ids.full}/join`, { as: "test-m4" });
});

test.after(async () => {
  if (fake) {
    fake.closeAllConnections(); // don't let open connections keep the test running
    fake.close();
  }
  await h.cleanTestData();
  await h.stop();
});

test("groups come back in the order the matchmaker scores them", async () => {
  preferred = [ids.g2, ids.g1];
  let r = await h.call("GET", `/events/${eventId}/groups`, { as: "test-viewer" });
  assert.strictEqual(r.data.ranked, true);
  assert.deepStrictEqual(r.data.groups.slice(0, 2).map((g) => g.id), [ids.g2, ids.g1]);
  assert.strictEqual(r.data.groups[0].match_score, 100);
  assert.deepStrictEqual(r.data.groups[0].shared_interests, ["rock"]);

  preferred = [ids.g1, ids.g2]; // "a different user": the order flips
  r = await h.call("GET", `/events/${eventId}/groups`, { as: "test-viewer" });
  assert.deepStrictEqual(r.data.groups.slice(0, 2).map((g) => g.id), [ids.g1, ids.g2]);
});

test("only joinable groups are sent for ranking, without private fields", async () => {
  await h.call("GET", `/events/${eventId}/groups`, { as: "test-viewer" });
  const sent = lastRequest.groups.map((g) => g.id).sort();
  assert.deepStrictEqual(sent, [ids.g1, ids.g2].sort()); // the full group is not sent
  const json = JSON.stringify(lastRequest);
  assert.ok(!json.includes("@example.com"), "no emails sent to the matchmaker");
  assert.ok(!json.includes("firebase_uid"));
});

test("my own group is listed first and full groups last", async () => {
  preferred = [ids.g2, ids.g1];
  const r = await h.call("GET", `/events/${eventId}/groups`, { as: "test-m1" });
  const order = r.data.groups.map((g) => g.id);
  assert.strictEqual(order[0], ids.g1);              // m1's own group
  assert.strictEqual(order[order.length - 1], ids.full);
  assert.strictEqual(r.data.groups[0].match_score, undefined); // own group isn't scored
});

test("if matchmaking is down, the list still loads, unranked", async () => {
  process.env.MATCHMAKING_URL = "http://localhost:1"; // nothing listens there
  const r = await h.call("GET", `/events/${eventId}/groups`, { as: "test-viewer" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ranked, false);
  assert.strictEqual(r.data.groups.length, 3);
  assert.ok(r.data.groups.every((g) => g.match_score === undefined));
});
