// The group room: header with status and fill bar, members on the left,
// action buttons (Lock in, Leave), and the live chat on the right.
// The page updates by itself when members join, leave or lock in (Socket.IO).
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGroup, joinGroup, leaveGroup, lockIn } from "../api/groupsApi";
import { LOCKED_LEAVE_PENALTY, BLOCK_DURATION_MIN } from "../constants";
import { formatDateTime, genderSummary } from "../utils/format";
import FillBar from "../components/groups/FillBar";
import MemberList from "../components/groups/MemberList";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";
import ConfirmModal from "../components/shared/ConfirmModal";
import ChatPanel from "../components/chat/ChatPanel";
import { useGroupLive } from "../hooks";

const STATUS_LABEL = { open: "Open", sealed: "Booking in progress", booked: "Booked" };

export default function GroupRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dbUser, refreshUser } = useAuth();

  const [group, setGroup] = useState(null);
  const [event, setEvent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal] = useState(null); // null | "lock" | "leave"

  const load = useCallback(async () => {
    try {
      const data = await getGroup(id);
      setGroup(data.group);
      setEvent(data.event);
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else setError(err.message || "Could not load this group.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: reload whenever someone joins, leaves or locks in (no refresh needed)
  useGroupLive(id, load);

  // Runs a button's request, then reloads the group so the screen is up to date.
  async function run(fn, after) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (after) after();
      else await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmLockIn() {
    await run(() => lockIn(group.id));
    setModal(null);
  }

  async function confirmLeave() {
    const locked = group.members.find((m) => m.id === dbUser.id)?.is_locked_in;
    await run(
      async () => {
        const res = await leaveGroup(group.id, locked);
        await refreshUser(); // trust score in the navbar/profile changes
        let flash = "You left the group.";
        if (res.blocked_until) {
          flash = `You left the group. Your trust score hit 0, so you can't create or join groups for ${BLOCK_DURATION_MIN} minutes.`;
        } else if (res.penalty) {
          flash = `You left the group and lost ${res.penalty} trust points. Your trust score is now ${res.trust_score}.`;
        }
        navigate(`/events/${event.id}/groups`, { state: { flash, penalty: res.penalty > 0 } });
      },
      () => {}
    );
    setModal(null);
  }

  if (notFound) {
    return (
      <div>
        <Link to="/" className="back-link">← All events</Link>
        <Notice type="error">This group no longer exists (everyone left).</Notice>
      </div>
    );
  }
  if (!group) return error ? <Notice type="error">{error}</Notice> : <Loader />;

  const statusText = group.status === "open" && group.is_full ? "Full" : STATUS_LABEL[group.status];
  const me = group.members.find((m) => m.id === dbUser.id);
  const lockedCount = group.members.filter((m) => m.is_locked_in).length;
  const trustAfter = Math.max(0, dbUser.trust_score - LOCKED_LEAVE_PENALTY);

  return (
    <div>
      <Link to={`/events/${event.id}/groups`} className="back-link">← Groups for {event.name}</Link>

      <header className="card room-header">
        <div className="room-header-top">
          <div>
            <div className="event-date">{formatDateTime(event.start_time)} · {event.venue_name}</div>
            <h1>{group.creator_name}'s group</h1>
            <div className="small muted">
              {event.name} · {group.member_count}/{group.max_size} · {genderSummary(group)}
            </div>
          </div>
          <span className={`chip status-chip status-${group.status}`}>{statusText}</span>
        </div>
        <FillBar count={group.member_count} max={group.max_size} />
      </header>

      {error && <Notice type="error">{error}</Notice>}

      <div className="room-layout">
        <section className="card">
          <h3>Members</h3>
          <MemberList members={group.members} creatorId={group.creator_id} meId={dbUser.id} />

          {group.is_member && (
            <p className="small muted lock-count">
              {lockedCount} of {group.member_count} locked in
            </p>
          )}

          <div className="btn-row">
            {group.is_member ? (
              group.status === "open" && (
                <>
                  {me?.is_locked_in ? (
                    <span className="chip chip-green locked-badge">✓ You're locked in</span>
                  ) : (
                    <button className="btn btn-gold" disabled={busy} onClick={() => setModal("lock")}>
                      Lock in
                    </button>
                  )}
                  <button
                    className="btn btn-danger-outline"
                    disabled={busy}
                    onClick={() => setModal("leave")}
                  >
                    Leave
                  </button>
                </>
              )
            ) : (
              group.status === "open" && !group.is_full && (
                <button className="btn" disabled={busy} onClick={() => run(() => joinGroup(group.id))}>
                  Join this group
                </button>
              )
            )}
          </div>
          {!group.is_member && (
            <p className="small muted">You're viewing this group. Join it to chat and book together.</p>
          )}
        </section>

        {modal === "lock" && (
          <ConfirmModal
            title="Lock in to this group?"
            confirmLabel="Yes, lock me in"
            busy={busy}
            onConfirm={confirmLockIn}
            onCancel={() => setModal(null)}
          >
            <p>
              Locking in tells the group you're definitely going. <strong>It can't be undone.</strong>
            </p>
            <p className="muted small">
              If you leave after locking in, your trust score drops by {LOCKED_LEAVE_PENALTY}.
            </p>
          </ConfirmModal>
        )}

        {modal === "leave" && (
          me?.is_locked_in ? (
            <ConfirmModal
              title="Leave after locking in?"
              confirmLabel={`Leave and lose ${LOCKED_LEAVE_PENALTY} points`}
              danger
              busy={busy}
              onConfirm={confirmLeave}
              onCancel={() => setModal(null)}
            >
              <p>
                You locked in, so leaving now drops your trust score by{" "}
                <strong className="red-text">{LOCKED_LEAVE_PENALTY}</strong>:{" "}
                {dbUser.trust_score} → <strong className="red-text">{trustAfter}</strong>.
              </p>
              {trustAfter === 0 && (
                <Notice type="error">
                  Your score would hit 0, so you'd be blocked from creating or joining groups for{" "}
                  {BLOCK_DURATION_MIN} minutes. After that it resets to 10.
                </Notice>
              )}
            </ConfirmModal>
          ) : (
            <ConfirmModal
              title="Leave this group?"
              confirmLabel="Leave"
              busy={busy}
              onConfirm={confirmLeave}
              onCancel={() => setModal(null)}
            >
              <p>You haven't locked in, so leaving won't affect your trust score.</p>
            </ConfirmModal>
          )
        )}

        <section className="card chat-panel">
          {group.is_member ? (
            <ChatPanel groupId={group.id} meId={dbUser.id} closed={event.has_ended} />
          ) : (
            <>
              <h3>Group chat</h3>
              <p className="muted small">Only members can see the chat. Join to say hi.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
