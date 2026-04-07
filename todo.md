# EchoNotes — Site Audit & TODO

**Date:** 2026-04-06
**Method:** Full Playwright browser testing + direct API (curl) testing

---

## About the "Backend Database" Issue

A partner reported that the backend database doesn't work. After investigation, the reason is straightforward: **there is no database connected**. All data lives in Python in-memory variables that reset every time the backend restarts.

**Evidence:**

| What | Where | Finding |
|------|-------|---------|
| Backend storage | `backend/app/main.py:12-14` | `_sessions: dict`, `_audio_records: list[dict]`, `_transcription_jobs: list[dict]` — all in-memory |
| Supabase client | `frontend/src/lib/supabaseClient.ts` | File exists (37 lines) but **nothing imports it** — dead code |
| Environment file | `frontend/.env` / `.env.local` | **Does not exist** — Supabase credentials never loaded |
| Supabase API key | `handoff.md` line 55 | Key `sb_publishable_dCywfnhM8qnPi3x6rMdGpw_hMInS_39` — doesn't match standard Supabase JWT format (`eyJ...`). Returns "Access to schema is forbidden" when tested. |
| DB packages | `backend/requirements.txt` | `psycopg2-binary` and `SQLAlchemy` installed but **never imported** in `main.py` |

**Result:** All sessions, audio metadata, and transcription jobs are lost on every backend restart. Audio files persist on disk in `backend/uploads/` but their metadata is gone.

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

### P1 — Critical: Database & Persistence

- [ ] **In-memory storage** — All data stored in Python dicts/lists, lost on restart
  - File: `backend/app/main.py:12-14`
  - Next step: Connect to Supabase PostgreSQL or local PostgreSQL via SQLAlchemy

- [ ] **Dead Supabase client** — `supabaseClient.ts` is never imported by any file
  - File: `frontend/src/lib/supabaseClient.ts` (entire file)
  - Next step: Either integrate it into `audioStorage.ts` or remove it

- [ ] **Missing .env file** — No `.env` or `.env.local` in frontend directory
  - Location: `frontend/`
  - Next step: Create `.env` with valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

- [ ] **Invalid Supabase API key** — Key in `handoff.md` doesn't work
  - File: `handoff.md` line 55
  - Next step: Get valid anon key from Supabase dashboard (should start with `eyJ...`)

- [ ] **Unused DB dependencies** — psycopg2-binary and SQLAlchemy installed but never used
  - File: `backend/requirements.txt`
  - Next step: Either wire them up or remove if using Supabase client-side only

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

- [ ] **Misleading "Supabase" labels** — UI says "Files in Supabase" and "verify Supabase integration" but Supabase is not used
  - File: `frontend/src/components/AudioUploadTest.tsx:80,104`
  - Next step: Change to "Your Files" or "Uploaded Files"

- [ ] **Page title is "frontend"** — Should be "EchoNotes"
  - File: `frontend/index.html:7`
  - Next step: Change `<title>frontend</title>` to `<title>EchoNotes</title>`

- [ ] **Vite boilerplate still present** — React/Vite logos, "Get started" heading, counter button, template footer links (GitHub/Discord/X.com/Bluesky all point to Vite community)
  - File: `frontend/src/App.tsx`
  - Next step: Replace with EchoNotes branding and actual app layout

- [ ] **No routing or 404 handling** — Any URL renders the same page
  - Next step: Add React Router or at minimum a 404 fallback

### P4 — Low: Backend & Security Hardening

- [ ] **No file-type validation** — Backend accepts any file (tested: .txt file uploaded successfully)
  - File: `backend/app/main.py` (upload endpoint)
  - Next step: Validate MIME type is `audio/*` before accepting

- [ ] **Public media endpoint** — `/media` serves files with no auth check
  - File: `backend/app/main.py:20`
  - Next step: Add session-based access control or signed URLs

- [ ] **Hardcoded backend URL** — `http://127.0.0.1:8000` in two frontend files
  - Files: `frontend/src/lib/audioStorage.ts:30`, `frontend/src/lib/apiClient.ts:3`
  - Next step: Use `VITE_API_BASE` env variable or Vite proxy config

- [ ] **No .env.example** — No template showing required environment variables
  - Next step: Create `frontend/.env.example` with placeholder values

---

## Files Reference

| File | Role | Status |
|------|------|--------|
| `backend/app/main.py` | All API endpoints + in-memory storage + async worker | Working but no persistence |
| `frontend/src/components/AudioUploadTest.tsx` | Audio upload/list/delete UI | Working but missing transcription UI, misleading labels |
| `frontend/src/lib/audioStorage.ts` | Backend API calls for audio CRUD | Working, `updateAudioMetadata` unimplemented |
| `frontend/src/lib/apiClient.ts` | Fetch wrapper with session token | Working, hardcoded URL |
| `frontend/src/lib/sessionToken.ts` | localStorage session token | Working |
| `frontend/src/lib/supabaseClient.ts` | Supabase client init | Dead code — nothing imports it |
| `frontend/src/App.tsx` | Main page layout | Working but full of Vite boilerplate |
| `frontend/index.html` | HTML entry point | Working, wrong title |
| `handoff.md` | Supabase setup docs | Outdated — describes integration that doesn't exist |
| `backend/tests/ownershiptests.py` | Session isolation tests | Working |
| `backend/tests/tokenvalidationtests.py` | Token validation tests | Working |

---

## Supabase SQL — Run in Dashboard > SQL Editor

Copy and paste the entire block below into **Supabase Dashboard > SQL Editor > New Query** and click **Run**.

```sql


```

After running, verify in the **Table Editor** that:
- `audio_files` has new columns: `owner_type`, `owner_id`
- `transcription_jobs` table exists with 8 columns
