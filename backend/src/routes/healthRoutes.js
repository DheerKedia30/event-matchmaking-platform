// Three tiny "are you alive?" endpoints. We use them to prove each
// part of the system is running and can talk to the next part.
const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

// 1) Is the Node backend itself running?
router.get("/", (req, res) => {
  res.json({ status: "ok", service: "backend" });
});

// 2) Can the backend talk to PostgreSQL?
router.get("/db", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) AS events FROM events");
    res.json({ status: "ok", service: "database", events: Number(result.rows[0].events) });
  } catch (err) {
    res.status(500).json({ status: "error", service: "database", message: err.message });
  }
});

// 3) Can the backend talk to the Python matchmaking service?
router.get("/matchmaking", async (req, res) => {
  try {
    const url = process.env.MATCHMAKING_URL || "http://localhost:8000";
    const response = await fetch(`${url}/health`);
    const data = await response.json();
    res.json({ status: "ok", service: "matchmaking", reply: data });
  } catch (err) {
    res.status(502).json({ status: "error", service: "matchmaking", message: err.message });
  }
});

module.exports = router;
