// Run with:  npm run db:init
// Reads schema.sql and runs it against your database to (re)create all tables.
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Schema created: all tables are ready.");
  await pool.end();
}

init().catch((err) => {
  console.error("Schema creation failed:", err.message);
  process.exit(1);
});
