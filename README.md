# EchoNotes

Audio note-taking app with upload, transcription, and summarization. Built with React + FastAPI + Supabase.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Python, FastAPI, Uvicorn
- **Database:** Supabase (PostgreSQL)
- **Storage:** Local disk (`backend/uploads/`) with session-authenticated access

## Current Status (MVP)

- Audio upload, list, playback, and delete
- Session-based ownership isolation (pre-auth)
- Transcription job pipeline (simulated — real speech-to-text coming)
- Data persisted to Supabase PostgreSQL
- File-type validation (audio only)
- Authenticated media endpoint

## Setup

### 1. Clone

```bash
git clone <repo-url>
cd CIS376_EchoNotes
```

### 2. Backend

**Mac / Linux:**
```bash
cd EchoNotes/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
cd EchoNotes\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Windows (Git Bash):**
```bash
cd EchoNotes/backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
```

Create `EchoNotes/backend/.env`:
```
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Start the server:
```bash
uvicorn app.main:app --reload --port 8000
```

Backend runs on `http://127.0.0.1:8000` — Swagger docs at `/docs`.

### 3. Frontend

```bash
cd EchoNotes/frontend
npm install
```

Create `EchoNotes/frontend/.env`:
```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
VITE_API_BASE=http://127.0.0.1:8000
```

Start the dev server:
```bash
npm run dev
```

Frontend runs on `http://localhost:5173`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/session/init` | Create or reuse session |
| GET | `/session/me` | Get current session ID |
| POST | `/audio/upload` | Upload audio file (audio MIME types only) |
| GET | `/audio` | List session-scoped audio files |
| DELETE | `/audio/{id}` | Delete audio file (ownership enforced) |
| GET | `/media/{file_path}` | Stream audio file (session-authenticated) |
| POST | `/jobs/transcribe/{audio_file_id}` | Create transcription job |
| GET | `/jobs/{job_id}/status` | Poll transcription job status |

All protected endpoints require an `X-Session-Token` header. The `/media` endpoint accepts a `token` query parameter (for `<audio>` element compatibility).

## Pre-auth Session Ownership (MVP)

- Frontend creates a stable browser token stored in localStorage
- Token sent as `X-Session-Token` on every API request
- Backend resolves token to a session ID
- All records stamped with `owner_type` / `owner_id`
- Read, delete, and media access filtered by ownership

**Known MVP limitations:**
- Sessions are in-memory (reset on backend restart, but audio data persists in Supabase)
- Transcription produces simulated output (real speech-to-text not yet integrated)

## Branching & PR Rules

- One issue = one branch = one PR
- Branch naming: `feat/<issue-number>-short-title`
- Keep PRs small and reviewable
- Ensure app runs locally before opening a PR
- Never commit `.venv`, `node_modules`, `.env`, or cache files

## Testing

- Backend tests: `cd EchoNotes/backend && python -m pytest tests/ -v`
- Frontend lint: `cd EchoNotes/frontend && npm run lint`
- Frontend build check: `cd EchoNotes/frontend && npm run build`
