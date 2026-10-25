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

const http = require("http");
const app = require("../src/app");
const { attachSockets } = require("../src/sockets/chatSocket");
const pool = require("../src/db/pool");
const { cleanTestData } = require("./cleanup");

let server;
let io;
let base;

async function start() {
  // Same setup as server.js: API + live chat on one server (random free port)
  server = http.createServer(app);
  io = attachSockets(server);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
}

async function stop() {
  io.close(); // also closes the HTTP server
  await pool.end();
}

const url = () => base;

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

// Creates a private test event (name starts "TEST-") with its own seat grid,
// so tests never depend on real groups/bookings that exist in your database.
async function makeEvent(name = "Event", { startsIn = "3 days", rows = 5, perRow = 10, ...extra } = {}) {
  const venue = (await pool.query("SELECT id FROM venues ORDER BY id LIMIT 1")).rows[0];
  const e = {
    base_price: 1000, discount_min_size: 3, discount_percent: 10, category: "concert", ...extra,
  };
  const r = await pool.query(
    `INSERT INTO events (venue_id, name, description, category, start_time, end_time,
                         base_price, discount_min_size, discount_percent)
     VALUES ($1, $2, 'test event', $3, now() + $4::interval, now() + $4::interval + interval '3 hours',
             $5, $6, $7) RETURNING *`,
    [venue.id, `TEST-${name}`, e.category, startsIn, e.base_price, e.discount_min_size, e.discount_percent]
  );
  const event = r.rows[0];
  await pool.query(
    `INSERT INTO seats (event_id, row_label, seat_no)
     SELECT $1, chr(64 + r), n FROM generate_series(1, $2) r, generate_series(1, $3) n`,
    [event.id, rows, perRow]
  );
  return event;
}

module.exports = { start, stop, call, url, makeUser, makeEvent, cleanTestData, pool };
