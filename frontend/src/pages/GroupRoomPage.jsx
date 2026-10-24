// The group room: header with status and fill bar, members on the left,
// action buttons, and the chat panel on the right (chat itself arrives in CP6).
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGroup, joinGroup, leaveGroup } from "../api/groupsApi";
import { formatDateTime, genderSummary } from "../utils/format";
import FillBar from "../components/groups/FillBar";
import MemberList from "../components/groups/MemberList";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

const STATUS_LABEL = { open: "Open", sealed: "Booking in progress", booked: "Booked" };

export default function GroupRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dbUser } = useAuth();

  const [group, setGroup] = useState(null);
  const [event, setEvent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

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

  function handleLeave() {
    if (!window.confirm("Leave this group?")) return;
    run(() => leaveGroup(group.id), () => navigate(`/events/${event.id}/groups`));
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

          <div className="btn-row">
            {group.is_member ? (
              group.status === "open" && (
                <button className="btn btn-danger-outline" disabled={busy} onClick={handleLeave}>
                  Leave
                </button>
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

        <section className="card chat-panel">
          <h3>Group chat</h3>
          {group.is_member ? (
            <p className="muted small">Chat will appear here.</p>
          ) : (
            <p className="muted small">Only members can see the chat.</p>
          )}
        </section>
      </div>
    </div>
  );
}
