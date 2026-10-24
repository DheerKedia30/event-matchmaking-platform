// One small function per backend URL for groups.
import { apiFetch } from "./client";

export const listGroupsForEvent = (eventId) => apiFetch(`/events/${eventId}/groups`);
export const createGroup = (eventId, maxSize) =>
  apiFetch(`/events/${eventId}/groups`, { method: "POST", body: { max_size: maxSize } });
export const getGroup = (groupId) => apiFetch(`/groups/${groupId}`);
export const joinGroup = (groupId) => apiFetch(`/groups/${groupId}/join`, { method: "POST" });
// confirm=true is needed when the user had locked in (leaving then costs trust points)
export const leaveGroup = (groupId, confirm = false) =>
  apiFetch(`/groups/${groupId}/leave`, { method: "POST", body: { confirm } });
export const lockIn = (groupId) => apiFetch(`/groups/${groupId}/lock-in`, { method: "POST" });
export const myGroups = () => apiFetch("/groups/mine");
