# The Python matchmaking service. For now it only has a health check.
# In Checkpoint 4 we add the scoring/ranking endpoint here.
from fastapi import FastAPI

app = FastAPI(title="Matchmaking Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "matchmaking"}
