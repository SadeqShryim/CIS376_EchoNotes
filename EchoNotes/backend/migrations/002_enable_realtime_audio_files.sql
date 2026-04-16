-- Enable Row-Level Security on audio_files and grant users SELECT access to
-- their own rows. The backend uses the service_role key, which bypasses RLS,
-- so INSERT/UPDATE/DELETE operations from the API continue to work unchanged.
--
-- This migration is required for the frontend's Supabase Realtime subscription
-- to receive live updates safely. Without RLS + an owner-scoped policy,
-- Realtime broadcasts would expose every user's rows to every subscriber, and
-- the anon key (which is embedded in the frontend bundle by design) would
-- grant full read access to everything.
--
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.

-- Drop any "allow everyone" development-mode policies that the Supabase Table
-- Editor's "Allow all for now" templates may have created previously. Without
-- this, PostgreSQL's OR-combine behaviour means any one permissive policy
-- defeats the restrictive one we're about to add.
DROP POLICY IF EXISTS "Allow all operations for now" ON audio_files;
DROP POLICY IF EXISTS "Allow public read access" ON audio_files;
DROP POLICY IF EXISTS "Allow public insert access" ON audio_files;
DROP POLICY IF EXISTS "Allow public update access" ON audio_files;
DROP POLICY IF EXISTS "Allow public delete access" ON audio_files;

-- Turn on row-level security for the table.
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

-- Allow the signed-in user to SELECT only their own rows. Both sides are cast
-- to text so the policy works whether owner_id is stored as uuid or text.
-- Drop first so re-running the migration doesn't error on a duplicate name.
DROP POLICY IF EXISTS "audio_files_owner_select" ON audio_files;
CREATE POLICY "audio_files_owner_select"
  ON audio_files
  FOR SELECT
  USING (auth.uid()::text = owner_id::text);

-- Add the table to the Realtime publication so postgres_changes events are
-- streamed to subscribed clients. IF NOT EXISTS handles re-runs where the
-- table has already been added (otherwise this statement errors).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'audio_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE audio_files;
  END IF;
END $$;
