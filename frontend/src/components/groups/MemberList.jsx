// The members of a group, shown in the group room: who they are and how reliable.
import { initials } from "../../utils/format";

export default function MemberList({ members, creatorId, meId }) {
  return (
    <ul className="member-list">
      {members.map((m) => (
        <li key={m.id} className="member">
          <span className="avatar">{initials(m.name)}</span>
          <div className="member-info">
            <div className="member-name">
              {m.name}
              {m.id === meId && <span className="muted small"> (you)</span>}
              {m.id === creatorId && <span className="chip tiny">Creator</span>}
              {m.is_locked_in && <span className="chip tiny chip-green">Locked in</span>}
            </div>
            <div className="small muted">
              {m.age} · {m.gender} · Trust {m.trust_score}
              {m.avg_peer_rating ? ` · ★ ${Number(m.avg_peer_rating).toFixed(1)}` : " · No ratings yet"}
            </div>
            {m.interests?.length > 0 && (
              <div className="member-tags">
                {m.interests.map((i) => (
                  <span key={i} className="chip tiny">{i}</span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
