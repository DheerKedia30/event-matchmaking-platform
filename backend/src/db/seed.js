// Run with:  npm run db:seed
// Fills the database with test data: 1 venue, 4 events, a seat grid per event
// and 6 test users. Safe to run again and again - it wipes the old data first.
const pool = require("./pool");

const ROWS = ["A", "B", "C", "D", "E"];
const SEATS_PER_ROW = 10;

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Wipe old data and reset the id counters back to 1
    await client.query(
      `TRUNCATE notifications, support_tickets, ratings, tickets, payments,
        booking_seats, bookings, messages, group_members, groups, seats,
        events, venues, users RESTART IDENTITY CASCADE`
    );

    // ---- Venue ----
    const venue = await client.query(
      `INSERT INTO venues (name, city, address)
       VALUES ('Grand Arena', 'Mumbai', 'Bandra Kurla Complex') RETURNING id`
    );
    const venueId = venue.rows[0].id;

    // ---- Events (dates are relative to "now" so they never go stale) ----
    const events = [
      ["Rock Night Live", "Loud guitars and a great crowd.", "concert", "3 days", 1500, 3, 15],
      ["Stand-up Special", "An evening of stand-up comedy.", "comedy", "5 days", 800, 3, 10],
      ["Indie Music Fest", "Upcoming indie bands on one stage.", "concert", "7 days", 1200, 4, 20],
      ["Drama: The Last Train", "A gripping stage play.", "theatre", "10 days", 600, 3, 10],
    ];
    const eventIds = [];
    for (const [name, desc, cat, startIn, price, minSize, pct] of events) {
      const r = await client.query(
        `INSERT INTO events
           (venue_id, name, description, category, start_time, end_time,
            base_price, discount_min_size, discount_percent)
         VALUES ($1, $2, $3, $4,
                 now() + $5::interval,
                 now() + $5::interval + interval '3 hours',
                 $6, $7, $8)
         RETURNING id`,
        [venueId, name, desc, cat, startIn, price, minSize, pct]
      );
      eventIds.push(r.rows[0].id);
    }

    // ---- Seat grid: 5 rows (A-E) x 10 seats for every event ----
    for (const eventId of eventIds) {
      for (const row of ROWS) {
        for (let n = 1; n <= SEATS_PER_ROW; n++) {
          await client.query(
            `INSERT INTO seats (event_id, row_label, seat_no) VALUES ($1, $2, $3)`,
            [eventId, row, n]
          );
        }
      }
    }

    // ---- 6 test users (the first one is an admin) ----
    // NOTE: these are for testing the database only. Real login users
    // are created from Firebase in Checkpoint 1.
    const users = [
      ["seed-admin", "Admin User", "admin@test.com", "admin", "other", 30, "{english,hindi}", "{music,theatre}"],
      ["seed-aarav", "Aarav", "aarav@test.com", "user", "male", 22, "{english,hindi}", "{rock,indie,music}"],
      ["seed-diya", "Diya", "diya@test.com", "user", "female", 21, "{english,hindi}", "{indie,comedy}"],
      ["seed-kabir", "Kabir", "kabir@test.com", "user", "male", 24, "{english}", "{rock,metal}"],
      ["seed-meera", "Meera", "meera@test.com", "user", "female", 23, "{english,marathi}", "{theatre,comedy}"],
      ["seed-rohan", "Rohan", "rohan@test.com", "user", "male", 25, "{english,hindi}", "{comedy,music}"],
    ];
    for (const [uid, name, email, role, gender, age, langs, interests] of users) {
      await client.query(
        `INSERT INTO users
           (firebase_uid, name, email, phone_verified, role, gender, age,
            languages, interests, consent_at)
         VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, now())`,
        [uid, name, email, role, gender, age, langs, interests]
      );
    }

    await client.query("COMMIT");
    console.log("Seed done: 1 venue, 4 events, 200 seats, 6 users.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
