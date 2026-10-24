// Logic for groups: create, list for an event, details, join, leave, "my groups".
// Rules (locked in the handoff):
//  - groups are open to everyone; the creator picks a size from 2 to 5
//  - a user can be in only ONE group per event
//  - nobody can join a full group, and nobody can join/leave once booking started
//  - if the last member leaves, the group is deleted
const pool = require("../db/pool");
const { MAX_GROUP } = require("../config/constants");

const MIN_SIZE = 2;

// Count + gender breakdown, worked out by the database for every group.
const GROUP_FIELDS = `
  g.id, g.event_id, g.creator_id, g.max_size, g.status, g.created_at,
  c.name AS creator_name,
  COUNT(gm.user_id)::int                                    AS member_count,
  COUNT(*) FILTER (WHERE u.gender = 'male')::int            AS male_count,
  COUNT(*) FILTER (WHERE u.gender = 'female')::int          AS female_count,
  COUNT(*) FILTER (WHERE u.gender = 'other')::int           AS other_count,
  COALESCE(json_agg(json_build_object(
      'id', u.id, 'name', u.name, 'gender', u.gender, 'age', u.age,
      'interests', u.interests, 'languages', u.languages,
      'trust_score', u.trust_score, 'avg_peer_rating', u.avg_peer_rating,
      'is_locked_in', gm.is_locked_in)
    ORDER BY gm.joined_at) FILTER (WHERE u.id IS NOT NULL), '[]') AS members
`;
const GROUP_FROM = `
  FROM groups g
  JOIN users c ON c.id = g.creator_id
  LEFT JOIN group_members gm ON gm.group_id = g.id
  LEFT JOIN users u ON u.id = gm.user_id
`;

// Small helper: send an error reply in our usual JSON shape.
function fail(res, status, error, message) {
  return res.status(status).json({ error, message });
}

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Adds is_full and is_member, which the frontend uses to pick the button to show.
function decorate(group, userId) {
  return {
    ...group,
    is_full: group.member_count >= group.max_size,
    is_member: group.members.some((m) => m.id === userId),
  };
}

// Which group (if any) is this user in for this event?
async function myGroupForEvent(db, userId, eventId) {
  const r = await db.query(
    `SELECT g.id FROM groups g JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1 AND g.event_id = $2`,
    [userId, eventId]
  );
  return r.rows[0] ? r.rows[0].id : null;
}

// Loads one event and checks people can still form groups for it.
async function loadBookableEvent(db, eventId) {
  const r = await db.query("SELECT * FROM events WHERE id = $1", [eventId]);
  const event = r.rows[0];
  if (!event) return { error: [404, "event_not_found", "Event not found."] };
  if (event.status !== "active") return { error: [400, "event_cancelled", "This event was cancelled."] };
  if (new Date(event.start_time) <= new Date()) {
    return { error: [400, "event_started", "This event has already started."] };
  }
  return { event };
}

// Loads one group with its members (used by details and after every change).
async function loadGroup(db, groupId) {
  const r = await db.query(
    `SELECT ${GROUP_FIELDS} ${GROUP_FROM} WHERE g.id = $1 GROUP BY g.id, c.name`,
    [groupId]
  );
  return r.rows[0] || null;
}

// ---------------------------------------------------------------------------

// GET /events/:id/groups  -> open groups for an event (not ranked yet; CP4 ranks them)
async function listForEvent(req, res) {
  const eventId = parseId(req.params.id);
  if (!eventId) return fail(res, 400, "bad_id", "Invalid event id.");

  const ev = await pool.query("SELECT id FROM events WHERE id = $1", [eventId]);
  if (!ev.rows[0]) return fail(res, 404, "event_not_found", "Event not found.");

  const r = await pool.query(
    `SELECT ${GROUP_FIELDS} ${GROUP_FROM}
      WHERE g.event_id = $1 AND g.status = 'open'
      GROUP BY g.id, c.name
      ORDER BY g.created_at DESC`,
    [eventId]
  );
  const groups = r.rows.map((g) => decorate(g, req.user.id));
  const myGroupId = await myGroupForEvent(pool, req.user.id, eventId);
  res.json({ groups, my_group_id: myGroupId });
}

// POST /events/:id/groups   body: { max_size: 2..5 }
async function createGroup(req, res) {
  const eventId = parseId(req.params.id);
  if (!eventId) return fail(res, 400, "bad_id", "Invalid event id.");

  const maxSize = Number(req.body.max_size);
  if (!Number.isInteger(maxSize) || maxSize < MIN_SIZE || maxSize > MAX_GROUP) {
    return fail(res, 400, "bad_size", `Group size must be between ${MIN_SIZE} and ${MAX_GROUP}.`);
  }

  // A "transaction": either every step below happens, or none of them do.
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Lock this user's row so two quick clicks can't create two groups.
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);

    const { error } = await loadBookableEvent(db, eventId);
    if (error) {
      await db.query("ROLLBACK");
      return fail(res, ...error);
    }
    if (await myGroupForEvent(db, req.user.id, eventId)) {
      await db.query("ROLLBACK");
      return fail(res, 409, "already_in_group", "You are already in a group for this event.");
    }

    const g = await db.query(
      `INSERT INTO groups (event_id, creator_id, max_size) VALUES ($1, $2, $3) RETURNING id`,
      [eventId, req.user.id, maxSize]
    );
    const groupId = g.rows[0].id;
    await db.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [
      groupId, req.user.id,
    ]);
    await db.query("COMMIT");

    const group = await loadGroup(pool, groupId);
    res.status(201).json({ group: decorate(group, req.user.id) });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}

// GET /groups/:id  -> one group with members + its event (any logged-in user can look)
async function getGroup(req, res) {
  const groupId = parseId(req.params.id);
  if (!groupId) return fail(res, 400, "bad_id", "Invalid group id.");

  const group = await loadGroup(pool, groupId);
  if (!group) return fail(res, 404, "group_not_found", "Group not found.");

  const ev = await pool.query(
    `SELECT e.id, e.name, e.category, e.start_time, e.end_time, e.base_price,
            e.discount_min_size, e.discount_percent, e.status,
            v.name AS venue_name, v.city AS venue_city, (e.end_time < now()) AS has_ended
       FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = $1`,
    [group.event_id]
  );
  res.json({ group: decorate(group, req.user.id), event: ev.rows[0] });
}

// POST /groups/:id/join
async function joinGroup(req, res) {
  const groupId = parseId(req.params.id);
  if (!groupId) return fail(res, 400, "bad_id", "Invalid group id.");

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Lock the group row: if two people click "Join" on the last spot at the
    // same moment, the second one waits here and then sees the group is full.
    const gr = await db.query("SELECT * FROM groups WHERE id = $1 FOR UPDATE", [groupId]);
    const group = gr.rows[0];
    let problem = null;

    if (!group) problem = [404, "group_not_found", "Group not found."];
    else if (group.status !== "open") {
      problem = [409, "group_sealed", "This group has started booking, so nobody can join now."];
    } else {
      const { error } = await loadBookableEvent(db, group.event_id);
      if (error) problem = error;
    }

    if (!problem) {
      const mine = await myGroupForEvent(db, req.user.id, group.event_id);
      if (mine === groupId) problem = [409, "already_member", "You are already in this group."];
      else if (mine) problem = [409, "already_in_group", "You are already in another group for this event. Leave it first."];
    }

    if (!problem) {
      const cnt = await db.query(
        "SELECT COUNT(*)::int AS n FROM group_members WHERE group_id = $1", [groupId]
      );
      if (cnt.rows[0].n >= group.max_size) problem = [409, "group_full", "This group is full."];
    }

    if (problem) {
      await db.query("ROLLBACK");
      return fail(res, ...problem);
    }

    await db.query("INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)", [
      groupId, req.user.id,
    ]);
    await db.query("COMMIT");

    const fresh = await loadGroup(pool, groupId);
    res.json({ group: decorate(fresh, req.user.id) });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}

// POST /groups/:id/leave
// (CP5 adds the trust penalty for leaving after locking in.)
async function leaveGroup(req, res) {
  const groupId = parseId(req.params.id);
  if (!groupId) return fail(res, 400, "bad_id", "Invalid group id.");

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const gr = await db.query("SELECT * FROM groups WHERE id = $1 FOR UPDATE", [groupId]);
    const group = gr.rows[0];
    if (!group) {
      await db.query("ROLLBACK");
      return fail(res, 404, "group_not_found", "Group not found.");
    }
    const mem = await db.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, req.user.id]
    );
    if (!mem.rows[0]) {
      await db.query("ROLLBACK");
      return fail(res, 409, "not_member", "You are not in this group.");
    }
    if (group.status !== "open") {
      await db.query("ROLLBACK");
      return fail(res, 409, "group_sealed", "Booking has started, so you can't leave now.");
    }

    await db.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [
      groupId, req.user.id,
    ]);
    const left = await db.query(
      "SELECT COUNT(*)::int AS n FROM group_members WHERE group_id = $1", [groupId]
    );
    const deleted = left.rows[0].n === 0;
    if (deleted) {
      // Nobody left: remove the empty group (its chat messages go with it).
      await db.query("DELETE FROM groups WHERE id = $1", [groupId]);
    }
    await db.query("COMMIT");
    res.json({ left: true, group_deleted: deleted });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}

// GET /groups/mine  -> every group I'm in, with its event (for the "My groups" page)
async function myGroups(req, res) {
  const r = await pool.query(
    `SELECT ${GROUP_FIELDS},
            e.name AS event_name, e.start_time AS event_start, e.category AS event_category
       ${GROUP_FROM}
       JOIN events e ON e.id = g.event_id
      WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = $1)
      GROUP BY g.id, c.name, e.name, e.start_time, e.category
      ORDER BY e.start_time`,
    [req.user.id]
  );
  res.json({ groups: r.rows.map((g) => decorate(g, req.user.id)) });
}

module.exports = { listForEvent, createGroup, getGroup, joinGroup, leaveGroup, myGroups };
