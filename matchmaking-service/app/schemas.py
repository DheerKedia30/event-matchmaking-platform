# The shape of the data the Node backend sends us and what we send back.
# Pydantic checks every request: wrong or missing fields get a clear 422 error.
from typing import List, Optional

from pydantic import BaseModel, Field


class Person(BaseModel):
    id: int
    age: Optional[int] = None
    gender: Optional[str] = None
    languages: List[str] = []
    interests: List[str] = []
    trust_score: int = 30
    avg_peer_rating: Optional[float] = None


class GroupIn(BaseModel):
    id: int
    max_size: int = Field(ge=2, le=5)
    members: List[Person]


class RankRequest(BaseModel):
    user: Person              # the person looking for a group
    groups: List[GroupIn]     # the open groups they could join


class Breakdown(BaseModel):
    interests: float
    reputation: float
    preferences: float
    size_fit: float


class RankedGroup(BaseModel):
    group_id: int
    score: int                     # 0 to 100, shown as "92% match"
    breakdown: Breakdown           # each part 0.0 to 1.0, useful for explaining
    shared_interests: List[str]    # e.g. ["indie", "rock"], shown on the card


class RankResponse(BaseModel):
    ranked: List[RankedGroup]      # best match first
