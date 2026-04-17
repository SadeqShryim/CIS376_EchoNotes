-- EchoNotes database schema
-- Run this in the Supabase SQL Editor after creating a new Supabase project.
-- Table order matters: audio_files must be created before transcription_jobs (FK dependency).

CREATE TABLE public.audio_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  duration_seconds double precision,
  transcript text,
  summary text,
  status text DEFAULT 'uploaded'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  owner_type text NOT NULL DEFAULT 'session'::text,
  owner_id text NOT NULL DEFAULT ''::text,
  CONSTRAINT audio_files_pkey PRIMARY KEY (id)
);

CREATE TABLE public.transcription_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  audio_file_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  owner_id text NOT NULL,
  external_job_id text,
  CONSTRAINT transcription_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT transcription_jobs_audio_file_id_fkey FOREIGN KEY (audio_file_id) REFERENCES public.audio_files(id)
);

-- Row Level Security
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY audio_files_owner_select ON public.audio_files
  FOR SELECT
  USING ((auth.uid())::text = owner_id);

-- Note: transcription_jobs has no RLS policies. All access goes through the FastAPI
-- backend using the Supabase service role key, which bypasses RLS. Writes to
-- audio_files also go through the backend.
