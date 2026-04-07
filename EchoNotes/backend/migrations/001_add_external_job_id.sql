-- Add external_job_id column to transcription_jobs table.
-- Stores the AssemblyAI transcript ID so webhook callbacks can be matched to jobs.
-- Run this in the Supabase SQL Editor before using the AssemblyAI transcription feature.

ALTER TABLE transcription_jobs
ADD COLUMN IF NOT EXISTS external_job_id TEXT;
