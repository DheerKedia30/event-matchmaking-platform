// Builds the Express app (the "brain") and plugs in the routes.
// Kept separate from server.js so we can test the app without starting a server.
const express = require("express");
const cors = require("cors");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

app.use(cors());          // lets the React site (another port) call this backend
app.use(express.json());  // lets us read JSON sent in request bodies

app.use("/health", healthRoutes);

module.exports = app;
