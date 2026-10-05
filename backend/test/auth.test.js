// Run with:  npm test
// Tests the auth routes WITHOUT calling real Firebase: we swap in a fake
// Firebase whose tokens look like  "tok|<uid>|<email>".
// It creates users whose firebase_uid starts with "test-" and deletes them after.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

// ---- the fake Firebase (must be installed BEFORE the app is loaded) ----
const phones = {}; // uid -> phone number, set by the tests to mimic "OTP done"
const fakeFirebase = {
  auth: () => ({
    verifyIdToken: async (token) => {
      const [tag, uid, email] = token.split("|");
      if (tag !== "tok") throw new Error("bad token");
      return { uid, email };
    },
    getUser: async (uid) => ({ uid, phoneNumber: phones[uid] }),
  }),
};
const firebasePath = require.resolve(path.join(__dirname, "../src/config/firebase.js"));
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: fakeFirebase };

const app = require("../src/app");
const pool = require("../src/db/pool");

let server, base;
const UID = "test-user-1";
const auth = { Authorization: `Bearer tok|${UID}|test1@example.com` };
const goodProfile = {
  name: "Test One", age: 22, gender: "female",
  languages: ["English", "hindi"], interests: ["Rock", "indie"], consent: true,
};

async function call(method, url, { headers = {}, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test.before(async () => {
  await pool.query("DELETE FROM users WHERE firebase_uid LIKE 'test-%'");
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  await pool.query("DELETE FROM users WHERE firebase_uid LIKE 'test-%'");
  server.close();
  await pool.end();
});

test("no token -> 401", async () => {
  const r = await call("GET", "/auth/me");
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.data.error, "missing_token");
});

test("bad token -> 401", async () => {
  const r = await call("GET", "/auth/me", { headers: { Authorization: "Bearer garbage" } });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.data.error, "invalid_token");
});

test("valid token but no profile yet -> 404", async () => {
  const r = await call("GET", "/auth/me", { headers: auth });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.data.error, "profile_missing");
});

test("register rejects under-age, bad gender, missing consent", async () => {
  let r = await call("POST", "/auth/register", { headers: auth, body: { ...goodProfile, age: 15 } });
  assert.strictEqual(r.status, 400);
  r = await call("POST", "/auth/register", { headers: auth, body: { ...goodProfile, gender: "x" } });
  assert.strictEqual(r.status, 400);
  r = await call("POST", "/auth/register", { headers: auth, body: { ...goodProfile, consent: false } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, "consent_required");
});

test("register creates profile with trust 30, unverified, lowercase lists", async () => {
  const r = await call("POST", "/auth/register", { headers: auth, body: goodProfile });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.user.trust_score, 30);
  assert.strictEqual(r.data.user.phone_verified, false);
  assert.strictEqual(r.data.user.role, "user");
  assert.deepStrictEqual(r.data.user.interests, ["rock", "indie"]);
  assert.strictEqual(r.data.user.email, "test1@example.com");
});

test("register twice -> 409", async () => {
  const r = await call("POST", "/auth/register", { headers: auth, body: goodProfile });
  assert.strictEqual(r.status, 409);
});

test("a second uid with the same email -> 409", async () => {
  const other = { Authorization: "Bearer tok|test-user-2|test1@example.com" };
  const r = await call("POST", "/auth/register", { headers: other, body: goodProfile });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, "email_taken");
});

test("/auth/me returns the profile", async () => {
  const r = await call("GET", "/auth/me", { headers: auth });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.user.name, "Test One");
});

test("verified-only route -> 403 before phone verification", async () => {
  const r = await call("GET", "/auth/verified-only", { headers: auth });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.error, "phone_not_verified");
});

test("verify-phone -> 400 when Firebase has no phone on the account", async () => {
  const r = await call("POST", "/auth/verify-phone", { headers: auth });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, "phone_not_linked");
});

test("verify-phone works once Firebase has the phone; verified-only -> 200", async () => {
  phones[UID] = "+919999999999"; // pretend the OTP step finished in Firebase
  let r = await call("POST", "/auth/verify-phone", { headers: auth });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.user.phone_verified, true);
  assert.strictEqual(r.data.user.phone, "+919999999999");
  r = await call("GET", "/auth/verified-only", { headers: auth });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ok, true);
});

test("update profile works and validates", async () => {
  let r = await call("PUT", "/auth/profile", {
    headers: auth, body: { ...goodProfile, name: "Renamed", interests: ["comedy"] },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.user.name, "Renamed");
  assert.deepStrictEqual(r.data.user.interests, ["comedy"]);
  r = await call("PUT", "/auth/profile", { headers: auth, body: { ...goodProfile, interests: [] } });
  assert.strictEqual(r.status, 400);
});

test("unknown URL -> clean JSON 404", async () => {
  const r = await call("GET", "/nope");
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.data.error, "not_found");
});
