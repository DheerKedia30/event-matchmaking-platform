// Every group the user is in, so they can get back to a group room quickly.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { myGroups } from "../api/groupsApi";
import { formatDateTime, genderSummary } from "../utils/format";
import FillBar from "../components/groups/FillBar";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

const STATUS_LABEL = { open: "Open", sealed: "Booking in progress", booked: "Booked" };

export default function MyGroupsPage() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    myGroups()
      .then((d) => setGroups(d.groups))
      .catch((err) => setError(err.message || "Could not load your groups."));
  }, []);

  if (error) return <Notice type="error">{error}</Notice>;
  if (!groups) return <Loader />;

  return (
    <div>
      <h1>My groups</h1>
      {groups.length === 0 ? (
        <div className="card empty-state">
          <p className="big">You're not in any group yet</p>
          <p className="muted">Pick an event and find people to go with.</p>
          <Link to="/" className="btn">Browse events</Link>
        </div>
      ) : (
        <div className="group-list">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="card group-card my-group-card">
              <div className="group-card-top">
                <div>
                  <div className="event-date">{formatDateTime(g.event_start)}</div>
                  <div className="group-title">{g.event_name}</div>
                  <div className="small muted">
                    {g.creator_name}'s group · {g.member_count}/{g.max_size} · {genderSummary(g)}
                  </div>
                </div>
                <span className={`chip status-chip status-${g.status}`}>
                  {g.status === "open" && g.is_full ? "Full" : STATUS_LABEL[g.status]}
                </span>
              </div>
              <FillBar count={g.member_count} max={g.max_size} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
