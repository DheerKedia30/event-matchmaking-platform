// One group in the list for an event: count, gender mix, fill bar, members and a button.
import { useState } from "react";
import { Link } from "react-router-dom";
import { genderSummary, initials } from "../../utils/format";
import FillBar from "./FillBar";

// Labels for the 4 parts of the match score (they come from the Python service).
const PARTS = [
  ["interests", "Shared interests", 40],
  ["reputation", "Members' trust & ratings", 25],
  ["preferences", "Age, language, gender", 25],
  ["size_fit", "Close to filling up", 10],
];

// onJoin(group) is called when "Join" is clicked. busy = a request is running.
export default function GroupCard({ group, onJoin, busy, canJoin }) {
  const [showWhy, setShowWhy] = useState(false);
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

      {group.shared_interests?.length > 0 && (
        <div className="small shared-line">
          You both like <span className="gold-text">{group.shared_interests.join(", ")}</span>
        </div>
      )}

      <FillBar count={group.member_count} max={group.max_size} />

      {group.match_breakdown && (
        <div>
          <button className="link-btn" onClick={() => setShowWhy(!showWhy)}>
            {showWhy ? "Hide" : "Why this match?"}
          </button>
          {showWhy && (
            <ul className="why-list">
              {PARTS.map(([key, label, weight]) => (
                <li key={key}>
                  <span className="small">{label} <span className="muted">({weight}%)</span></span>
                  <span className="why-bar">
                    <span style={{ width: `${Math.round(group.match_breakdown[key] * 100)}%` }} />
                  </span>
                  <span className="small muted">{Math.round(group.match_breakdown[key] * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
