// Shared test helpers (used by every test file from CP2 onwards).
// - Swaps in a FAKE Firebase whose tokens look like "tok|<uid>|<email>"
//   so tests never call the real Firebase.
// - Starts the app on a random port and gives you a call() function.
// - Can create test users directly in the database (firebase_uid starts "test-").
const path = require("path");

const fakeFirebase = {
  auth: () => ({
    verifyIdToken: async (token) => {
      const [tag, uid, email] = token.split("|");
      if (tag !== "tok") throw new Error("bad token");
      return { uid, email };
    },
    getUser: async (uid) => ({ uid }),
  }),
};
const firebasePath = require.resolve(path.join(__dirname, "../src/config/firebase.js"));
require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true, exports: fakeFirebase,
};

const app = require("../src/app");
const pool = require("../src/db/pool");

let server;
let base;

async function start() {
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
}

async function stop() {
  server.close();
  await pool.end();
}

// call("GET", "/events", { as: "test-a" })  -> { status, data }
async function call(method, url, { as, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (as) headers.Authorization = `Bearer tok|${as}|${as}@example.com`;
  const res = await fetch(base + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body
  }
  return { status: res.status, data };
}

// Creates a ready-to-use test user straight in the database.
async function makeUser(uid, extra = {}) {
  const u = {
    name: uid, gender: "male", age: 22, phone_verified: true,
    languages: ["english"], interests: ["rock"], trust_score: 30, ...extra,
  };
  const r = await pool.query(
    `INSERT INTO users (firebase_uid, name, email, phone_verified, gender, age,
                        languages, interests, trust_score, consent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) RETURNING *`,
    [uid, u.name, `${uid}@example.com`, u.phone_verified, u.gender, u.age,
     u.languages, u.interests, u.trust_score]
  );
  return r.rows[0];
}

// Removes everything test users created, in an order the foreign keys allow.
async function cleanTestData() {
  const ids = `(SELECT id FROM users WHERE firebase_uid LIKE 'test-%')`;
  const groups = `(SELECT id FROM groups WHERE creator_id IN ${ids})`;
  await pool.query(`DELETE FROM support_tickets WHERE user_id IN ${ids}`);
  await pool.query(`DELETE FROM ratings WHERE rater_id IN ${ids} OR ratee_id IN ${ids}`);
  await pool.query(`DELETE FROM notifications WHERE user_id IN ${ids}`);
  await pool.query(
    `UPDATE seats SET status = 'available' WHERE id IN (
       SELECT bs.seat_id FROM booking_seats bs JOIN bookings b ON b.id = bs.booking_id
        WHERE b.group_id IN ${groups})`
  );
  await pool.query(`DELETE FROM bookings WHERE group_id IN ${groups}`);
  await pool.query(`DELETE FROM groups WHERE id IN ${groups}`);
  await pool.query(`DELETE FROM group_members WHERE user_id IN ${ids}`);
  await pool.query(`DELETE FROM messages WHERE user_id IN ${ids}`);
  await pool.query(`DELETE FROM users WHERE firebase_uid LIKE 'test-%'`);
}

module.exports = { start, stop, call, makeUser, cleanTestData, pool };
