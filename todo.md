# EchoNotes — Site Audit & TODO

**Date:** 2026-04-06
**Method:** Full Playwright browser testing + direct API (curl) testing

---

## About the "Backend Database" Issue — RESOLVED

A partner originally reported that the backend database doesn't work. The root cause was that all data was stored in Python in-memory variables with no database connected.

**Resolution:** Backend now connects to Supabase PostgreSQL via `supabase-py`. All sessions, audio metadata, and transcription jobs persist across restarts. The frontend no longer talks to Supabase directly — all DB access goes through FastAPI (`backend/app/db.py`).

---

## What Works

Confirmed via Playwright browser testing and API calls:

**Session Management**
- [x] Session init (`POST /session/init`) — creates/reuses session, returns session_id
- [x] Session token persisted in localStorage, sent via `X-Session-Token` header
- [x] Token validation — missing/invalid tokens return proper 403 errors
- [x] `GET /session/me` returns current session ID

**Audio CRUD (via UI)**
- [x] Audio upload — file picker works, file uploads, success message displayed
- [x] Audio listing — files shown with filename, size (KB/MB), status, timestamp
- [x] Audio playback — HTML5 `<audio>` controls work correctly
- [x] Audio delete — file removed, success message displayed, list refreshes

**Transcription Jobs (API only — no frontend UI)**
- [x] `POST /jobs/transcribe/{audio_file_id}` creates job, returns job_id
- [x] `GET /jobs/{job_id}/status` returns job status
- [x] Background worker processes jobs: queued -> running -> succeeded (~5s)
- [x] Transcript written back to audio record after job completion

**Security / Isolation**
- [x] Session isolation — different tokens see separate file lists
- [x] Cross-session delete protection — returns "Audio not found"
- [x] Health endpoint (`GET /health`) returns ok
- [x] CORS configured for localhost:5173

---

## What Doesn't Work

### P1 — Critical: Database & Persistence ✅ DONE

- [x] **In-memory storage** — Replaced with Supabase PostgreSQL via `supabase-py`
  - File: `backend/app/db.py` (Supabase client), `backend/app/main.py` (all endpoints use DB)

- [x] **Dead Supabase client** — `supabaseClient.ts` deleted (frontend no longer talks to Supabase directly)

- [x] **Missing .env file** — Created for both backend and frontend with proper credentials

- [x] **Invalid Supabase API key** — Resolved; backend uses service role key, frontend only knows the API base URL

- [x] **Unused DB dependencies** — Cleaned up; now using `supabase-py` instead of psycopg2/SQLAlchemy

### P2 — High: Missing Core Features

- [ ] **No transcription button in frontend** — Jobs can only be triggered via API
  - File: `frontend/src/components/AudioUploadTest.tsx`
  - Next step: Add a "Transcribe" button per file that calls `POST /jobs/transcribe/{id}`

- [ ] **No transcript display in UI** — Backend produces transcripts but frontend never shows them
  - File: `frontend/src/components/AudioUploadTest.tsx` (field `f.transcript` exists in type but is never rendered)
  - Next step: Display transcript text below the audio player when available

- [ ] **Fake transcription** — Worker returns hardcoded "Transcription of {filename}"
  - File: `backend/app/main.py:218`
  - Next step: Integrate a real speech-to-text service (Whisper API, AssemblyAI, etc.)

- [ ] **No summarization** — No endpoint, summary field always null
  - File: `backend/app/main.py` (no `/jobs/summarize` endpoint exists)
  - Next step: Add summarization endpoint and integrate an LLM API

- [ ] **updateAudioMetadata not implemented** — Throws error when called
  - File: `frontend/src/lib/audioStorage.ts:61-65`
  - Next step: Add `PATCH /audio/{id}` endpoint on backend, wire up frontend

### P3 — Medium: UI/UX Cleanup

- [ ] **Misleading "Supabase" labels** — UI says "Files in Supabase" and "verify Supabase integration"; users shouldn't see infrastructure names
  - File: `frontend/src/components/AudioUploadTest.tsx`
  - Next step: Change to "Your Files" or "Uploaded Files"

- [ ] **Page title is "frontend"** — Should be "EchoNotes"
  - File: `frontend/index.html:7`
  - Next step: Change `<title>frontend</title>` to `<title>EchoNotes</title>`

- [ ] **Vite boilerplate still present** — React/Vite logos, "Get started" heading, counter button, template footer links (GitHub/Discord/X.com/Bluesky all point to Vite community)
  - File: `frontend/src/App.tsx`
  - Next step: Replace with EchoNotes branding and actual app layout

- [ ] **No routing or 404 handling** — Any URL renders the same page
  - Next step: Add React Router or at minimum a 404 fallback

### P4 — Low: Backend & Security Hardening ✅ DONE

- [x] **File-type validation** — Backend rejects non-audio MIME types with 400
  - File: `backend/app/main.py` (upload endpoint)

- [x] **Authenticated media endpoint** — `/media` now requires session token via `token` query param

- [x] **Configurable backend URL** — Frontend reads `VITE_API_BASE` env var, falls back to `http://127.0.0.1:8000`
  - Files: `frontend/src/lib/audioStorage.ts`, `frontend/src/lib/apiClient.ts`

- [ ] **No .env.example** — No template showing required environment variables
  - Next step: Create `.env.example` files with placeholder values

---

## Files Reference

| File | Role | Status |
|------|------|--------|
| `backend/app/main.py` | All API endpoints + Supabase persistence + async worker | Working |
| `backend/app/db.py` | Supabase client initialization | Working |
| `frontend/src/components/AudioUploadTest.tsx` | Audio upload/list/delete UI | Working but missing transcription UI, misleading labels |
| `frontend/src/lib/audioStorage.ts` | Backend API calls for audio CRUD | Working, `updateAudioMetadata` unimplemented |
| `backend/tests/conftest.py` | Test cleanup fixture | Working |
| `frontend/src/lib/apiClient.ts` | Fetch wrapper with session token | Working, configurable URL |
| `frontend/src/lib/sessionToken.ts` | localStorage session token | Working |
| `frontend/src/App.tsx` | Main page layout | Working but full of Vite boilerplate |
| `frontend/index.html` | HTML entry point | Working, wrong title |
| `backend/tests/ownershiptests.py` | Session isolation tests | Working |
| `backend/tests/tokenvalidationtests.py` | Token validation tests | Working |

---

## Supabase Tables

Tables are already set up in Supabase PostgreSQL:
- `audio_files` — stores audio metadata with `owner_type` and `owner_id` columns
- `transcription_jobs` — tracks transcription job status and results
