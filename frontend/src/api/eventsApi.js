// One small function per backend URL under /events.
import { apiFetch } from "./client";

// filters = { q: "rock", category: "concert" }  (both optional)
export function listEvents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  return apiFetch("/events" + (qs ? `?${qs}` : ""));
}

export const getEvent = (id) => apiFetch(`/events/${id}`);
