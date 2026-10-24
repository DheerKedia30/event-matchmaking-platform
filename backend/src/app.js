// Builds the Express app (the "brain") and plugs in the routes.
// Kept separate from server.js so we can test the app without starting a server.
const express = require("express");
const cors = require("cors");
const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const groupRoutes = require("./routes/groupRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());          // lets the React site (another port) call this backend
app.use(express.json());  // lets us read JSON sent in request bodies

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/events", eventRoutes);
app.use("/groups", groupRoutes);

app.use(notFound);        // must come AFTER all routes
app.use(errorHandler);    // must be the LAST thing

module.exports = app;
