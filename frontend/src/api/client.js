// One helper for talking to our backend. It automatically attaches the
// user's Firebase login token, so every request proves who is calling.
import { auth } from "../firebase";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };

  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // the reply had no JSON body; ignore
  }

  if (!res.ok) {
    const err = new Error(data?.message || "Request failed");
    err.status = res.status; // e.g. 401, 403, 404
    err.code = data?.error;  // e.g. "phone_not_verified"
    throw err;
  }
  return data;
}
