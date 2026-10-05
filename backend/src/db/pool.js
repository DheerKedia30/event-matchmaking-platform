// One shared "pool" of database connections for the whole backend.
// A pool keeps a few connections open and reuses them, which is much
// faster than opening a new connection for every request.
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
