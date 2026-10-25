// "Find a group" for one event: the list of open groups plus a "Create group" box.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getEvent } from "../api/eventsApi";
import { listGroupsForEvent, createGroup, joinGroup } from "../api/groupsApi";
import { formatDateTime } from "../utils/format";
import GroupCard from "../components/groups/GroupCard";
import { useEventGroupsLive } from "../hooks";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

const SIZES = [2, 3, 4, 5];

export default function GroupsPage() {
  const { id } = useParams(); // event id from the URL
  const navigate = useNavigate();
  const { dbUser, refreshUser } = useAuth();
  const location = useLocation();
  // A message passed here after leaving a group. Kept in local state and then
  // removed from the browser history, so it doesn't come back on refresh.
  const [flash] = useState(location.state || null);
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [event, setEvent] = useState(null);
  const [groups, setGroups] = useState(null);
  const [myGroupId, setMyGroupId] = useState(null);
  const [ranked, setRanked] = useState(true);
  const [size, setSize] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [ev, gr] = await Promise.all([getEvent(id), listGroupsForEvent(id)]);
      setEvent(ev.event);
      setGroups(gr.groups);
      setMyGroupId(gr.my_group_id);
      setRanked(gr.ranked);
    } catch (err) {
      setError(err.message || "Could not load groups.");
    }
  }, [id]);

  useEffect(() => {
    load();
    refreshUser(); // pick up a new trust score / a block that just ended
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Live: refresh the list when anyone creates, joins or leaves a group for this event
  useEventGroupsLive(id, load);

  // Why this user can't create/join right now (or "" if they can)
  const blocked = dbUser.blocked_until && new Date(dbUser.blocked_until) > new Date();
  let blockReason = "";
  if (!dbUser.phone_verified) blockReason = "verify";
  else if (blocked) blockReason = "blocked";
  else if (myGroupId) blockReason = "member";

  async function handleCreate() {
    setBusy(true);
    setError("");
    try {
      const { group } = await createGroup(id, size);
      navigate(`/groups/${group.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function handleJoin(group) {
    setBusy(true);
    setError("");
    try {
      await joinGroup(group.id);
      navigate(`/groups/${group.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      load(); // the group may have just filled up; show the latest state
    }
  }

  if (error && !event) {
    return (
      <div>
        <Link to="/" className="back-link">← All events</Link>
        <Notice type="error">{error}</Notice>
      </div>
    );
  }
  if (!event || !groups) return <Loader />;

  return (
    <div>
      <Link to={`/events/${event.id}`} className="back-link">← {event.name}</Link>

      <div className="groups-header">
        <div>
          <div className="event-date">{formatDateTime(event.start_time)}</div>
          <h1>Groups for {event.name}</h1>
          <p className="muted small">
            Groups of {event.discount_min_size}+ get {event.discount_percent}% off. Groups are
            sorted by how well they match you, or start your own.
          </p>
        </div>
      </div>

      {flash && blockReason !== "blocked" && (
        <Notice type={flash.penalty ? "error" : "success"}>{flash.flash}</Notice>
      )}

      {blockReason === "verify" && (
        <Notice type="info">
          Verify your phone to create or join a group. <Link to="/signup">Verify now</Link>
        </Notice>
      )}
      {blockReason === "blocked" && (
        <Notice type="error">
          Your trust score hit 0, so you can't create or join groups until{" "}
          {new Date(dbUser.blocked_until).toLocaleString("en-IN")}.
        </Notice>
      )}
      {blockReason === "member" && (
        <Notice type="success">
          You're already in a group for this event.{" "}
          <Link to={`/groups/${myGroupId}`}>Open your group</Link>
        </Notice>
      )}
      {error && <Notice type="error">{error}</Notice>}

      <div className="groups-layout">
        <aside className="card create-box">
          <h3>Start a group</h3>
          <p className="small muted">How many people, including you?</p>
          <div className="chip-select">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={`chip-option ${size === n ? "active" : ""}`}
                onClick={() => setSize(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            className="btn btn-block"
            onClick={handleCreate}
            disabled={busy || blockReason !== ""}
          >
            Create group of {size}
          </button>
        </aside>

        <section>
          {!ranked && groups.length > 0 && (
            <Notice type="info">
              Matching is offline right now, so groups are shown newest first instead of best match.
            </Notice>
          )}
          {groups.length === 0 ? (
            <div className="card empty-state">
              <p className="big">No groups yet</p>
              <p className="muted">Be the first: start a group and others will join you.</p>
            </div>
          ) : (
            <div className="group-list">
              {groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  onJoin={handleJoin}
                  busy={busy}
                  canJoin={blockReason === ""}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
