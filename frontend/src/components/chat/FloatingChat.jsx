// A chat bubble in the bottom-right corner that opens the group chat.
// Wide screens: a panel on the right, and the page moves left to make room.
// Tablets/phones: a sheet over the bottom of the screen.
// While it's closed, a badge counts new messages from other members.
import { useEffect, useState } from "react";
import { getSocket } from "../../socket";
import ChatPanel from "./ChatPanel";

export default function FloatingChat({ groupId, meId, closed = false }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Count messages that arrive while the panel is closed
  useEffect(() => {
    const socket = getSocket();
    socket.emit("watch_group", groupId);
    const onMessage = (m) => {
      if (Number(m.group_id) !== Number(groupId) || m.user_id === meId) return;
      if (!open) setUnread((n) => n + 1);
    };
    socket.on("message", onMessage);
    return () => socket.off("message", onMessage);
  }, [groupId, meId, open]);

  // On wide screens the open chat sits beside the page; this class moves the page left
  useEffect(() => {
    document.body.classList.toggle("chat-docked", open);
    return () => document.body.classList.remove("chat-docked");
  }, [open]);

  // Close with the Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
    setUnread(0);
  }

  return (
    <>
      {open && <div className="chat-dock-backdrop" onClick={toggle} />}
      {open && (
        <div className="card chat-dock" role="dialog" aria-label="Group chat">
          <button className="chat-dock-close" onClick={toggle} aria-label="Close chat">×</button>
          <ChatPanel groupId={groupId} meId={meId} closed={closed} />
        </div>
      )}
      <button
        className={`chat-fab ${open ? "is-open" : ""}`}
        onClick={toggle}
        aria-label={open ? "Close group chat" : `Open group chat${unread ? `, ${unread} new` : ""}`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        {!open && unread > 0 && <span className="chat-fab-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </>
  );
}
