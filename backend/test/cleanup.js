// Safe cleanup for tests: removes every "test-" user and "TEST-" event together
// with everything that points at them (groups, bookings, chat ...), in an order
// the database's foreign keys allow. Used by every test file.
const pool = require("../src/db/pool");

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
  await pool.query(`DELETE FROM events WHERE name LIKE 'TEST-%'`); // seats go with them
}

module.exports = { cleanTestData };
