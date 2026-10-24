// One group in the list for an event: count, gender mix, fill bar, members and a button.
import { Link } from "react-router-dom";
import { genderSummary, initials } from "../../utils/format";
import FillBar from "./FillBar";

// onJoin(group) is called when "Join" is clicked. busy = a request is running.
export default function GroupCard({ group, onJoin, busy, canJoin }) {
  let action;
  if (group.is_member) {
    action = <Link to={`/groups/${group.id}`} className="btn btn-small">Open</Link>;
  } else if (group.is_full) {
    action = <button className="btn btn-small" disabled>Full</button>;
  } else {
    action = (
      <button
        className="btn btn-small"
        disabled={busy || !canJoin}
        onClick={() => onJoin(group)}
      >
        Join
      </button>
    );
  }

  return (
    <div className="card group-card">
      <div className="group-card-top">
        <div>
          <Link to={`/groups/${group.id}`} className="group-title">
            {group.creator_name}'s group
          </Link>
          <div className="small muted">
            {group.member_count}/{group.max_size} · {genderSummary(group)}
          </div>
        </div>
        {group.match_score != null && (
          <span className="chip gold match-chip">{group.match_score}% match</span>
        )}
      </div>

      <FillBar count={group.member_count} max={group.max_size} />

      <div className="group-card-bottom">
        <div className="avatar-stack">
          {group.members.map((m) => (
            <span key={m.id} className="avatar avatar-sm" title={`${m.name}, ${m.age}`}>
              {initials(m.name)}
            </span>
          ))}
        </div>
        {action}
      </div>
    </div>
  );
}
