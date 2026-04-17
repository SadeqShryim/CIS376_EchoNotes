# EchoNotes

EchoNotes is an audio note-taking web app for meeting review. Upload a recording and the app returns a speaker-labeled transcript from AssemblyAI and an AI-generated summary from Anthropic Claude. Email / password accounts are handled through Supabase Auth.

## Live Demo

https://cis-376-project.vercel.app

You will need to create an account on the live site to try it end to end.

## Tech Stack

- React 19, TypeScript, Vite (frontend)
- Python 3.11+, FastAPI, Uvicorn (backend)
- Supabase: authentication, PostgreSQL, and object storage
- AssemblyAI: speech-to-text with speaker diarization
- Anthropic Claude: structured meeting summaries
- Hosted on Vercel (frontend) and Render (backend)

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- Git
- A Supabase account (free tier is sufficient)
- An AssemblyAI API key (free trial credit is sufficient for testing)
- An Anthropic API key (prepaid or free credit)

## Local Setup

The repository root is `CIS376_EchoNotes/`. The application code lives in the `EchoNotes/` subfolder. The Chrome extension at `echonotes-recorder/` is optional and not required for grading.

### 1. Clone the repository

```bash
git clone https://github.com/SadeqShryim/CIS376_EchoNotes.git
cd CIS376_EchoNotes
```

### 2. Create a Supabase project

1. Sign in to https://supabase.com and create a new project.
2. Wait a couple of minutes for the database to finish provisioning.

### 3. Run the database schema

1. Open the Supabase dashboard for your project.
2. Go to the SQL Editor and click New Query.
3. Paste the full contents of `schema.sql` (at the root of this repo) into the editor and click Run.

This creates the `audio_files` and `transcription_jobs` tables and the row-level security policy that scopes reads to the owning user.

### 4. Create the Storage bucket

1. In the Supabase dashboard, open Storage.
2. Create a new bucket named exactly `audio-uploads`.
3. Mark the bucket Public.
4. Keep the default file size limit (50 MB). Leave MIME type restrictions empty.

The bucket must be public for the current playback flow to work (the backend issues time-limited signed URLs for reads).

### 5. Collect API keys

- Supabase: Project Settings > API. Copy the Project URL, the `anon public` key, and the `service_role` key.
- AssemblyAI: sign in at https://www.assemblyai.com/ and copy the API key from the dashboard.
- Anthropic: sign in at https://console.anthropic.com/ and create an API key.

### 6. Backend setup

Open a terminal at the repo root.

```bash
cd EchoNotes/backend
python -m venv .venv
source .venv/bin/activate          # macOS / Linux / Git Bash on Windows
# .venv\Scripts\Activate.ps1       # Windows PowerShell
pip install -r requirements.txt
cp .env.example .env
```

Open `EchoNotes/backend/.env` and fill in every value. Then start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

The backend runs at http://127.0.0.1:8000. Auto-generated API docs: http://127.0.0.1:8000/docs.

### 7. Frontend setup

Open a second terminal at the repo root.

```bash
cd EchoNotes/frontend
npm install
cp .env.example .env
```

Open `EchoNotes/frontend/.env` and fill in every value. Keep `VITE_API_BASE=http://127.0.0.1:8000` for local development. Then start the dev server:

```bash
npm run dev
```

The app loads at http://localhost:5173. Create an account, upload an audio file, then use the Transcribe and Summarize buttons.

### 8. (Optional) Run the backend tests

```bash
cd EchoNotes/backend
python -m pytest tests/ -v
```

## Production Deployment

The live deployment at https://cis-376-project.vercel.app is set up as follows.

### Frontend (Vercel)

1. Import the repository in the Vercel dashboard.
2. Set Root Directory to `EchoNotes/frontend`.
3. Framework preset: Vite (detected automatically).
4. Add these environment variables in the Vercel dashboard:
   - `VITE_API_BASE`: the Render backend URL (for example `https://echonotes-backend.onrender.com`)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

### Backend (Render)

1. Create a new Web Service on Render and connect the repository.
2. Root Directory: `EchoNotes/backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ASSEMBLYAI_API_KEY`
   - `ANTHROPIC_API_KEY`
6. Make sure the deployed Vercel origin is included in the CORS allow list in `EchoNotes/backend/app/main.py`.

### Keeping the backend warm

The Render free tier spins the container down after 15 minutes of inactivity, which causes a 10 to 30 second cold start on the next request. This deployment uses a free cron-job.org job that calls `GET /health` on the Render backend every 10 minutes to keep the container warm. A grader reproducing the deployment has two options:

- Set up a similar keepalive ping (cron-job.org, UptimeRobot, or any scheduler).
- Upgrade the Render service to the Starter plan (currently $7 / month) to avoid sleep entirely.

## Project Structure

```
CIS376_EchoNotes/
  README.md
  schema.sql                   # Supabase database schema (run once)
  EchoNotes/
    backend/                   # FastAPI backend (deployed on Render)
      app/
        main.py                # FastAPI entry point
        db.py                  # Supabase client
        dependencies.py        # JWT auth dependency
        storage.py             # Supabase Storage helpers
        routers/               # auth, audio, jobs, summary, webhooks
        services/              # AssemblyAI and Anthropic integrations
      tests/                   # pytest suite
      migrations/              # one-off SQL migrations applied during development
      requirements.txt
      .env.example
    frontend/                  # React 19 + Vite (deployed on Vercel)
      src/
        pages/                 # Login, Signup, Upload, Recordings, Notes, AudioDetail
        components/            # Layout, cards, viewers
        lib/                   # API client, auth, Supabase Realtime client
      package.json
      package-lock.json
      vercel.json
      .env.example
  echonotes-recorder/          # Optional Chrome MV3 extension for tab recording
```

## API Endpoints

All protected endpoints expect `Authorization: Bearer <access_token>` using the token returned by `POST /auth/login`.

| Method | Path                              | Auth        | Description                                            |
|--------|-----------------------------------|-------------|--------------------------------------------------------|
| GET    | `/health`                         | none        | Liveness probe (also used by the keepalive job)        |
| POST   | `/auth/signup`                    | none        | Create an account, returns an access token             |
| POST   | `/auth/login`                     | none        | Email / password login, returns an access token        |
| POST   | `/auth/logout`                    | Bearer      | Log the current user out                               |
| GET    | `/auth/me`                        | Bearer      | Return the current user id                             |
| POST   | `/audio/upload`                   | Bearer      | Upload an audio file (multipart)                       |
| GET    | `/audio`                          | Bearer      | List the caller's recordings                           |
| DELETE | `/audio/{id}`                     | Bearer      | Delete a recording                                     |
| GET    | `/media/{file_path}?token=<jwt>`  | query token | Return a signed URL for playback                       |
| POST   | `/jobs/transcribe/{audio_file_id}`| Bearer      | Submit a recording to AssemblyAI                       |
| GET    | `/jobs/{job_id}/status`           | Bearer      | Poll a transcription job (auto-finalises on completion)|
| POST   | `/audio/{id}/summarize`           | Bearer      | Generate a Claude summary from the stored transcript   |
| GET    | `/audio/{id}/summary`             | Bearer      | Return the stored summary                              |
| POST   | `/webhooks/assemblyai`            | none        | AssemblyAI completion callback                         |
