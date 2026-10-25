// Starts the backend: loads settings from .env, then listens on a port.
// One HTTP server carries both the normal API (Express) and live chat (Socket.IO).
require("dotenv").config();
const http = require("http");
const app = require("./app");
const { attachSockets } = require("./sockets/chatSocket");

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
attachSockets(server);

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT} (API + live chat)`);
});
