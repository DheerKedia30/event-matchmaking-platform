// Live updates over Socket.IO (runs inside the same Node server as the API).
//
// Rooms (a "room" = a list of connected browsers that get the same messages):
//   group:<id>  anyone looking at a group's page  -> "group_updated" when it changes
//   chat:<id>   only MEMBERS of that group          -> "message" for each chat message
//   event:<id>  anyone on an event's groups list    -> "groups_changed"
//   user:<id>   every browser tab of one user (used to kick them out of a chat they left)
//
// Every connection must send a valid Firebase login token, checked just like the API does.
const { Server } = require("socket.io");
const pool = require("../db/pool");
const firebase = require("../config/firebase");

const MAX_MESSAGE_LENGTH = 500;
let io = null; // stays null in tests that don't start sockets, so emits do nothing

// ---------- helpers other files call ----------

// Tell everyone watching a group (and that event's group list) that it changed.
function emitGroupChanged(groupId, eventId) {
  if (!io) return;
  io.to(`group:${groupId}`).emit("group_updated", { groupId });
  if (eventId) io.to(`event:${eventId}`).emit("groups_changed", { eventId });
}

// A user left a group: stop sending them that group's chat.
function removeFromChat(userId, groupId) {
  if (!io) return;
  io.in(`user:${userId}`).socketsLeave(`chat:${groupId}`);
}

// ---------- database checks ----------

async function isMember(groupId, userId) {
  const r = await pool.query(
    "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  return r.rows.length > 0;
}

async function eventHasEnded(groupId) {
  const r = await pool.query(
    `SELECT (e.end_time < now()) AS ended FROM groups g JOIN events e ON e.id = g.event_id
      WHERE g.id = $1`,
    [groupId]
  );
  return r.rows[0] ? r.rows[0].ended : true;
}

// Saves a message and returns it in the shape the frontend shows.
async function saveMessage(groupId, user, text) {
  const r = await pool.query(
    `INSERT INTO messages (group_id, user_id, text) VALUES ($1, $2, $3)
     RETURNING id, group_id, user_id, text, created_at`,
    [groupId, user.id, text]
  );
  return { ...r.rows[0], user_name: user.name };
}

const toId = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const reply = (ack, data) => typeof ack === "function" && ack(data);

// ---------- setup ----------

function attachSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: "*" } });

  // Gatekeeper: runs once when a browser connects.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("missing_token"));
      const decoded = await firebase.auth().verifyIdToken(token);
      const r = await pool.query("SELECT id, name FROM users WHERE firebase_uid = $1", [decoded.uid]);
      if (!r.rows[0]) return next(new Error("profile_missing"));
      socket.data.user = r.rows[0];
      next();
    } catch {
      next(new Error("invalid_token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);

    // Open a group page: get its updates, and its chat if you're a member.
    socket.on("watch_group", async (groupId, ack) => {
      const id = toId(groupId);
      if (!id) return reply(ack, { ok: false, error: "bad_id" });
      socket.join(`group:${id}`);
      const member = await isMember(id, user.id).catch(() => false);
      if (member) socket.join(`chat:${id}`);
      else socket.leave(`chat:${id}`);
      reply(ack, { ok: true, member });
    });

    socket.on("unwatch_group", (groupId) => {
      const id = toId(groupId);
      if (!id) return;
      socket.leave(`group:${id}`);
      socket.leave(`chat:${id}`);
    });

    // Open an event's group list: hear when groups are created/joined/left.
    socket.on("watch_event", (eventId) => {
      const id = toId(eventId);
      if (id) socket.join(`event:${id}`);
    });
    socket.on("unwatch_event", (eventId) => {
      const id = toId(eventId);
      if (id) socket.leave(`event:${id}`);
    });

    // Send a chat message. The database is checked every time, so someone who
    // just left (or was never a member) can't post.
    socket.on("send_message", async (payload, ack) => {
      try {
        const id = toId(payload?.groupId);
        const text = String(payload?.text ?? "").trim();
        if (!id) return reply(ack, { ok: false, error: "bad_id" });
        if (!text) return reply(ack, { ok: false, error: "empty", message: "Type a message first." });
        if (text.length > MAX_MESSAGE_LENGTH) {
          return reply(ack, {
            ok: false, error: "too_long", message: `Keep it under ${MAX_MESSAGE_LENGTH} characters.`,
          });
        }
        if (!(await isMember(id, user.id))) {
          return reply(ack, { ok: false, error: "not_member", message: "Only group members can chat." });
        }
        if (await eventHasEnded(id)) {
          return reply(ack, { ok: false, error: "chat_closed", message: "The event has ended, so this chat is closed." });
        }
        const message = await saveMessage(id, user, text);
        socket.join(`chat:${id}`); // in case they joined the group after opening the page
        io.to(`chat:${id}`).emit("message", message);
        reply(ack, { ok: true, message });
      } catch (err) {
        console.error("send_message failed:", err.message);
        reply(ack, { ok: false, error: "server_error", message: "Message not sent. Try again." });
      }
    });
  });

  return io;
}

module.exports = { attachSockets, emitGroupChanged, removeFromChat, MAX_MESSAGE_LENGTH };
