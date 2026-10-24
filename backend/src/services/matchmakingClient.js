// Talks to the Python matchmaking service (POST /rank).
// If Python is down, slow or broken, we return null and the caller shows the
// groups UNRANKED instead. The demo can never crash because of matchmaking.
const TIMEOUT_MS = 2000; // give up after 2 seconds

// Only the fields the scorer needs (no emails, phone numbers etc. leave the backend).
function toPerson(u) {
  return {
    id: u.id,
    age: u.age,
    gender: u.gender,
    languages: u.languages || [],
    interests: u.interests || [],
    trust_score: u.trust_score,
    avg_peer_rating: u.avg_peer_rating == null ? null : Number(u.avg_peer_rating),
  };
}

// user = the person looking; groups = groups with a "members" list.
// Returns a Map: group id -> { score, breakdown, shared_interests }, or null on failure.
async function rankGroups(user, groups) {
  if (groups.length === 0) return new Map();

  const url = process.env.MATCHMAKING_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${url}/rank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: toPerson(user),
        groups: groups.map((g) => ({
          id: g.id,
          max_size: g.max_size,
          members: g.members.map(toPerson),
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`matchmaking replied ${res.status}`);
    const data = await res.json();
    return new Map(data.ranked.map((r) => [r.group_id, r]));
  } catch (err) {
    console.warn("Matchmaking unavailable, showing groups unranked:", err.message);
    return null;
  }
}

module.exports = { rankGroups };
