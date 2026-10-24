# Tests for the matchmaking score. Uses only Python's built-in "unittest",
# so nothing extra needs installing. Run from the matchmaking-service folder:
#     python -m unittest -v
import unittest

from pydantic import ValidationError

from app.main import rank
from app.schemas import GroupIn, Person, RankRequest
from app.scoring import (
    age_score,
    gender_score,
    jaccard,
    language_score,
    rank_groups,
    reputation_score,
    size_fit_score,
)


def person(pid, **kw):
    base = dict(age=22, gender="male", languages=["english"], interests=["rock"], trust_score=30)
    base.update(kw)
    return Person(id=pid, **base)


class Parts(unittest.TestCase):
    def test_jaccard(self):
        self.assertEqual(jaccard(["rock", "indie"], ["rock", "indie"]), 1.0)
        self.assertEqual(jaccard(["rock"], ["jazz"]), 0.0)
        self.assertAlmostEqual(jaccard(["Rock", "indie"], ["rock", "metal"]), 1 / 3)
        self.assertEqual(jaccard([], ["rock"]), 0.0)

    def test_reputation_uses_trust_and_rating(self):
        good = reputation_score([person(1, trust_score=50, avg_peer_rating=5.0)])
        new = reputation_score([person(2, trust_score=30)])
        bad = reputation_score([person(3, trust_score=0, avg_peer_rating=1.0)])
        self.assertEqual(good, 1.0)
        self.assertEqual(bad, 0.0)
        self.assertTrue(bad < new < good)

    def test_age_language_gender(self):
        me = person(1, age=22, languages=["hindi"], gender="female")
        self.assertEqual(age_score(me, [person(2, age=22)]), 1.0)
        self.assertEqual(age_score(me, [person(2, age=40)]), 0.0)
        self.assertEqual(language_score(me, [person(2, languages=["hindi", "english"]), person(3)]), 0.5)
        self.assertEqual(gender_score(me, [person(2, gender="male")]), 0.0)
        self.assertEqual(gender_score(me, [person(2, gender="female")]), 1.0)

    def test_size_fit(self):
        g = lambda n, size: GroupIn(id=1, max_size=size, members=[person(i) for i in range(n)])
        self.assertEqual(size_fit_score(g(4, 5)), 1.0)   # user takes the last spot
        self.assertEqual(size_fit_score(g(1, 5)), 0.25)
        self.assertEqual(size_fit_score(g(1, 2)), 1.0)


class Ranking(unittest.TestCase):
    def setUp(self):
        self.rock_group = GroupIn(id=1, max_size=4, members=[
            person(10, interests=["rock", "metal"]), person(11, interests=["rock"])])
        self.comedy_group = GroupIn(id=2, max_size=4, members=[
            person(20, interests=["comedy", "theatre"], gender="female"),
            person(21, interests=["comedy"], gender="female")])

    def test_two_users_get_different_orders(self):
        rocker = person(1, interests=["rock", "metal"])
        comic = person(2, interests=["comedy", "theatre"], gender="female")
        a = [r["group_id"] for r in rank_groups(rocker, [self.rock_group, self.comedy_group])]
        b = [r["group_id"] for r in rank_groups(comic, [self.rock_group, self.comedy_group])]
        self.assertEqual(a, [1, 2])
        self.assertEqual(b, [2, 1])

    def test_score_is_0_to_100_with_breakdown_and_shared(self):
        r = rank_groups(person(1, interests=["rock", "indie"]), [self.rock_group])[0]
        self.assertTrue(0 <= r["score"] <= 100)
        self.assertEqual(set(r["breakdown"]), {"interests", "reputation", "preferences", "size_fit"})
        self.assertEqual(r["shared_interests"], ["rock"])

    def test_endpoint_and_empty_list(self):
        out = rank(RankRequest(user=person(1), groups=[self.comedy_group, self.rock_group]))
        self.assertEqual([g["group_id"] for g in out["ranked"]], [1, 2])
        self.assertEqual(rank(RankRequest(user=person(1), groups=[]))["ranked"], [])

    def test_bad_input_is_rejected(self):
        with self.assertRaises(ValidationError):
            GroupIn(id=1, max_size=9, members=[])


if __name__ == "__main__":
    unittest.main()
