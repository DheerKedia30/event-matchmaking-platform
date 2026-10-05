# Event Matchmaking & Shared Group Ticket Pass Platform

Three parts, run together:

| Part | Folder | Port | Start command |
|---|---|---|---|
| Backend (Node/Express) | backend/ | 4000 | npm run dev |
| Matchmaking (Python/FastAPI) | matchmaking-service/ | 8000 | uvicorn app.main:app --reload --port 8000 |
| Frontend (React/Vite) | frontend/ | 5173 | npm run dev |

Database: PostgreSQL, database name `event_platform`.
See backend/.env.example for settings.
