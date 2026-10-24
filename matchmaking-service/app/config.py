# All the tunable numbers for matchmaking live here, in ONE place.
# Version 1 is rule-based on purpose: we don't have real data yet to train a
# model. Once users have booked and rated each other, these hand-picked
# weights can be replaced by weights learned from that data.

# How much each part counts towards the final score. They add up to 1.0.
WEIGHTS = {
    "interests": 0.40,    # do we like the same kind of things?
    "reputation": 0.25,   # are the members reliable? (trust score + peer rating)
    "preferences": 0.25,  # similar age, a shared language, someone of my gender
    "size_fit": 0.10,     # is the group close to filling up (and booking soon)?
}

# Inside "preferences": how much each piece counts. Adds up to 1.0.
PREFERENCE_WEIGHTS = {
    "age": 0.4,
    "language": 0.4,
    "gender": 0.2,
}

# An age gap of this many years (or more) counts as "no age match at all".
AGE_GAP_FOR_ZERO = 15

# Trust scores start at 30. We treat 50+ as "fully trusted".
TRUST_FOR_FULL = 50

# Users with no ratings yet are treated as average (not bad, not great).
NEUTRAL_RATING = 3.0
