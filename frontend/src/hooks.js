// Small reusable "hooks" for live updates.
import { useEffect, useState } from "react";
import { getSocket } from "./socket";

// Is the live connection up? (shows the "Live" / "Reconnecting..." dot)
export function useSocketStatus() {
  const socket = getSocket();
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    socket.on("connect_error", off);
    setConnected(socket.connected);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
      socket.off("connect_error", off);
    };
  }, [socket]);
  return connected;
}

// Call onChange() whenever something happens to this group (join, leave, lock-in, booking...).
// Also re-subscribes after a reconnect, so updates keep coming after a network blip.
export function useGroupLive(groupId, onChange) {
  useEffect(() => {
    if (!groupId) return;
    const socket = getSocket();
    const watch = () => socket.emit("watch_group", groupId);
    const handler = (d) => {
      if (Number(d.groupId) !== Number(groupId)) return;
      watch(); // membership may have changed: re-subscribe so a new member gets the chat
      onChange();
    };
    watch();
    socket.on("connect", watch);
    socket.on("group_updated", handler);
    return () => {
      socket.emit("unwatch_group", groupId);
      socket.off("connect", watch);
      socket.off("group_updated", handler);
    };
  }, [groupId, onChange]);
}

// Call onChange() whenever groups for this event change (the "Groups for X" list).
export function useEventGroupsLive(eventId, onChange) {
  useEffect(() => {
    if (!eventId) return;
    const socket = getSocket();
    const watch = () => socket.emit("watch_event", eventId);
    const handler = (d) => Number(d.eventId) === Number(eventId) && onChange();
    watch();
    socket.on("connect", watch);
    socket.on("groups_changed", handler);
    return () => {
      socket.emit("unwatch_event", eventId);
      socket.off("connect", watch);
      socket.off("groups_changed", handler);
    };
  }, [eventId, onChange]);
}
