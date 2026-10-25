// One shared live connection (Socket.IO) to the backend, for chat and live updates.
// It sends the Firebase login token on every (re)connect, so the server knows who we are.
// If a different person logs in on the same tab, the old connection is closed first.
import { io } from "socket.io-client";
import { auth } from "./firebase";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

let socket = null;
let socketUid = null;

export function getSocket() {
  const uid = auth.currentUser?.uid || null;
  if (socket && socketUid === uid) return socket;
  if (socket) socket.disconnect();

  socketUid = uid;
  socket = io(API, {
    // called on every connect/reconnect, so an expired token gets refreshed
    auth: async (cb) => cb({ token: auth.currentUser ? await auth.currentUser.getIdToken() : null }),
  });
  return socket;
}
