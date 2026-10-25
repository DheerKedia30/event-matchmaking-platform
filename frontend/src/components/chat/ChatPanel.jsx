// The live group chat in the group room.
// History comes from the API when the panel opens; new messages arrive over
// the live connection. Your own messages are gold bubbles on the right.
import { useEffect, useRef, useState } from "react";
import { getMessages } from "../../api/groupsApi";
import { getSocket } from "../../socket";
import { useSocketStatus } from "../../hooks";
import { formatTime } from "../../utils/format";
import Notice from "../shared/Notice";

const MAX_LENGTH = 500; // same limit as the backend

export default function ChatPanel({ groupId, meId, closed }) {
  const [messages, setMessages] = useState(null); // null = loading
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const connected = useSocketStatus();
  const listRef = useRef(null);

  // Load history, then listen for new messages
  useEffect(() => {
    let cancelled = false;
    const socket = getSocket();
    socket.emit("watch_group", groupId); // make sure we're subscribed to this chat

    getMessages(groupId)
      .then((d) => !cancelled && setMessages(d.messages))
      .catch((err) => !cancelled && setError(err.message));

    const onMessage = (m) => {
      if (Number(m.group_id) !== Number(groupId)) return;
      // add it unless we already have it (no duplicates after a reconnect)
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
    };
    socket.on("message", onMessage);
    return () => {
      cancelled = true;
      socket.off("message", onMessage);
    };
  }, [groupId]);

  // Keep the newest message in view
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setError("");
    getSocket()
      .timeout(5000)
      .emit("send_message", { groupId, text: clean }, (timeoutErr, res) => {
        setSending(false);
        if (timeoutErr) return setError("Message not sent. Check your connection and try again.");
        if (!res.ok) return setError(res.message || "Message not sent.");
        setText("");
      });
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <h3>Group chat</h3>
        <span className={`live-dot ${connected ? "on" : ""}`}>
          {connected ? "Live" : "Reconnecting..."}
        </span>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages === null && !error && <p className="muted small">Loading messages...</p>}
        {messages && messages.length === 0 && (
          <p className="muted small chat-empty">No messages yet. Say hi and plan where to meet!</p>
        )}
        {messages &&
          messages.map((m) => {
            const mine = m.user_id === meId;
            return (
              <div key={m.id} className={`bubble-row ${mine ? "mine" : ""}`}>
                <div className={`bubble ${mine ? "bubble-mine" : ""}`}>
                  {!mine && <div className="bubble-name">{m.user_name}</div>}
                  <div className="bubble-text">{m.text}</div>
                  <div className="bubble-time">{formatTime(m.created_at)}</div>
                </div>
              </div>
            );
          })}
      </div>

      {error && <Notice type="error">{error}</Notice>}

      {closed ? (
        <p className="muted small chat-closed">The event has ended, so this chat is closed.</p>
      ) : (
        <form className="chat-form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            placeholder={connected ? "Type a message..." : "Waiting for connection..."}
            aria-label="Message"
            disabled={!connected}
          />
          <button className="btn btn-small" disabled={!connected || sending || !text.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
