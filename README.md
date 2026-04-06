# CIS376-Project MVP stage
Current Project Status

Frontend scaffolded with React + TypeScript + Vite

Backend scaffolded with FastAPI

Health check route implemented: GET /health

Tech Stack
Frontend: React, TypeScript, Vite

Backend: Python, FastAPI, Uvicorn

Planned: PostgreSQL, Redis, Celery (for async transcription jobs)



1. Clone and Open

git clone <repo-url>

cd CIS376-TermProject/EchoNotes



3. Frontend Setup
   
cd frontend

npm install

npm run dev

Frontend runs on: http://localhost:5173


3. Backend Setup

   
Open a second terminal:

cd EchoNotes/backend


python3 -m venv .venv


source .venv/bin/activate


pip install -r requirements.txt


python -m uvicorn app.main:app --reload --port 8000


Backend runs on: http://127.0.0.1:8000

Swagger docs: http://127.0.0.1:8000/docs

Health route: http://127.0.0.1:8000/health



4. Daily Workflow (Brief)
Pull latest main before starting:

git checkout main

git pull

Create a branch for your issue:

git checkout -b feat/<issue-number>-short-title



5. Team Rules (Short)
One issue = one branch = one PR,
Keep PRs small and reviewable,
Don’t commit .venv, node_modules, or cache files,
Make sure app runs locally before opening PR




## Pre-auth Session Ownership (MVP)

EchoNotes now uses a temporary session ownership model before full authentication.

- Frontend creates a stable browser token and stores it in localStorage.
- Frontend sends token as X-Session-Token on every API request.
- Backend endpoint POST /session/init creates or reuses a session identity.
- Protected routes resolve token to session_id.
- New records are stamped with:
  - owner_type = "session"
  - owner_id = resolved session_id
- Read and delete operations are filtered by owner fields.

Current MVP scope:
- Session-scoped upload, list, and delete for audio.

Known MVP limitations:
- Session and audio metadata are in-memory and reset on backend restart.
- Media files are served via /media and are not yet protected by signed URLs.
