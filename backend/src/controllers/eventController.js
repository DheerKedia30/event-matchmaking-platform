// Logic for the events pages: the list (with search) and one event's details.
const pool = require("../db/pool");

const CATEGORIES = ["concert", "comedy", "theatre"];

// The columns we send to the frontend for every event.
// "open_groups" counts groups that are open AND still have a free spot.
const EVENT_FIELDS = `
  e.id, e.name, e.description, e.category, e.start_time, e.end_time,
  e.base_price, e.discount_min_size, e.discount_percent, e.status,
  v.name AS venue_name, v.city AS venue_city, v.address AS venue_address,
  (SELECT COUNT(*)::int FROM groups g
     WHERE g.event_id = e.id AND g.status = 'open'
       AND (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) < g.max_size
  ) AS open_groups,
  (e.end_time < now()) AS has_ended
`;

// GET /events?q=rock&category=concert
// q        = optional search word (matches event name, description or venue)
// category = optional, one of CATEGORIES
async function listEvents(req, res) {
  const q = (req.query.q || "").trim();
  const category = (req.query.category || "").trim().toLowerCase();

  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: "bad_category",
      message: `Category must be one of: ${CATEGORIES.join(", ")}`,
    });
  }

  // Build the WHERE part step by step. Values go in "params" ($1, $2...)
  // and are never glued into the SQL text, which keeps us safe from SQL injection.
  const where = ["e.status = 'active'"];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(e.name ILIKE $${params.length} OR e.description ILIKE $${params.length}
        OR v.name ILIKE $${params.length})`
    );
  }
  if (category) {
    params.push(category);
    where.push(`e.category = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT ${EVENT_FIELDS}
       FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.start_time`,
    params
  );
  res.json({ events: result.rows });
}

// GET /events/:id
async function getEvent(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "bad_id", message: "Invalid event id." });
  }

  const result = await pool.query(
    `SELECT ${EVENT_FIELDS},
            (SELECT COUNT(*)::int FROM seats s
               WHERE s.event_id = e.id AND s.status = 'available') AS seats_left
       FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE e.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "event_not_found", message: "Event not found." });
  }
  res.json({ event: result.rows[0] });
}

module.exports = { listEvents, getEvent, CATEGORIES };
