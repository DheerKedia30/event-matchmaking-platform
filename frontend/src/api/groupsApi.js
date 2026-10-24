// One small function per backend URL for groups.
import { apiFetch } from "./client";

export const listGroupsForEvent = (eventId) => apiFetch(`/events/${eventId}/groups`);
export const createGroup = (eventId, maxSize) =>
  apiFetch(`/events/${eventId}/groups`, { method: "POST", body: { max_size: maxSize } });
export const getGroup = (groupId) => apiFetch(`/groups/${groupId}`);
export const joinGroup = (groupId) => apiFetch(`/groups/${groupId}/join`, { method: "POST" });
export const leaveGroup = (groupId) => apiFetch(`/groups/${groupId}/leave`, { method: "POST" });
export const myGroups = () => apiFetch("/groups/mine");
