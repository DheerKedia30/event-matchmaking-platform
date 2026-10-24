# The matchmaking score: how well does one user fit one group?
# Every part returns a number from 0.0 (no fit) to 1.0 (perfect fit),
# then the parts are combined with the WEIGHTS from config.py.
from typing import List

from .config import (
    AGE_GAP_FOR_ZERO,
    NEUTRAL_RATING,
    PREFERENCE_WEIGHTS,
    TRUST_FOR_FULL,
    WEIGHTS,
)


def _clean(items) -> set:
    return {str(i).strip().lower() for i in (items or []) if str(i).strip()}


def jaccard(a, b) -> float:
    """Overlap of two lists: shared items / all distinct items (0.0 to 1.0)."""
    a, b = _clean(a), _clean(b)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def interest_score(user, members) -> float:
    """Average interest overlap between the user and each member."""
    if not members:
        return 0.0
    return sum(jaccard(user.interests, m.interests) for m in members) / len(members)


def reputation_score(members) -> float:
    """How reliable the group looks: half trust score, half peer rating."""
    if not members:
        return 0.0
    total = 0.0
    for m in members:
        trust = min(max(m.trust_score, 0), TRUST_FOR_FULL) / TRUST_FOR_FULL
        rating = m.avg_peer_rating if m.avg_peer_rating is not None else NEUTRAL_RATING
        rating = (min(max(rating, 1.0), 5.0) - 1.0) / 4.0  # 1..5 stars -> 0..1
        total += 0.5 * trust + 0.5 * rating
    return total / len(members)


def age_score(user, members) -> float:
    """1.0 when ages match, falling to 0.0 at an AGE_GAP_FOR_ZERO year gap."""
    ages = [m.age for m in members if m.age is not None]
    if user.age is None or not ages:
        return 0.5  # unknown: neither good nor bad
    per_member = [max(0.0, 1 - abs(user.age - a) / AGE_GAP_FOR_ZERO) for a in ages]
    return sum(per_member) / len(per_member)


def language_score(user, members) -> float:
    """Share of members who speak at least one language the user speaks."""
    if not members:
        return 0.0
    mine = _clean(user.languages)
    shared = sum(1 for m in members if mine & _clean(m.languages))
    return shared / len(members)


def gender_score(user, members) -> float:
    """1.0 if at least one member has the user's gender (comfort for meeting strangers)."""
    if not user.gender or not members:
        return 0.5
    return 1.0 if any(m.gender == user.gender for m in members) else 0.0


def preference_score(user, members) -> float:
    return (
        PREFERENCE_WEIGHTS["age"] * age_score(user, members)
        + PREFERENCE_WEIGHTS["language"] * language_score(user, members)
        + PREFERENCE_WEIGHTS["gender"] * gender_score(user, members)
    )


def size_fit_score(group) -> float:
    """Groups closer to full get a small boost: they will reach booking sooner."""
    spots_needed_to_fill = group.max_size - 1  # the user would take the last spot
    if spots_needed_to_fill <= 0:
        return 0.0
    return min(1.0, len(group.members) / spots_needed_to_fill)


def shared_interests(user, members) -> List[str]:
    everyone = set()
    for m in members:
        everyone |= _clean(m.interests)
    return sorted(_clean(user.interests) & everyone)


def score_group(user, group) -> dict:
    """Full result for one group: score 0-100 plus the parts behind it."""
    parts = {
        "interests": interest_score(user, group.members),
        "reputation": reputation_score(group.members),
        "preferences": preference_score(user, group.members),
        "size_fit": size_fit_score(group),
    }
    total = sum(WEIGHTS[name] * value for name, value in parts.items())
    return {
        "group_id": group.id,
        "score": round(total * 100),
        "breakdown": {k: round(v, 3) for k, v in parts.items()},
        "shared_interests": shared_interests(user, group.members),
    }


def rank_groups(user, groups) -> List[dict]:
    """Score every group and return them best first (ties: smaller group id first)."""
    results = [score_group(user, g) for g in groups]
    results.sort(key=lambda r: (-r["score"], r["group_id"]))
    return results
