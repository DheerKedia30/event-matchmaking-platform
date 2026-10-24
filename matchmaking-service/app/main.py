# The Python matchmaking service.
#   GET  /health  -> "I'm alive" (used by the Node backend's status check)
#   POST /rank    -> takes one user + a list of open groups, returns them ranked
from fastapi import FastAPI

from .config import WEIGHTS
from .schemas import RankRequest, RankResponse
from .scoring import rank_groups

app = FastAPI(title="Matchmaking Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "matchmaking", "weights": WEIGHTS}


@app.post("/rank", response_model=RankResponse)
def rank(req: RankRequest):
    return {"ranked": rank_groups(req.user, req.groups)}
