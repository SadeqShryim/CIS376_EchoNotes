import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const hasSupabaseRealtime = Boolean(supabase);

if (!supabase) {
  console.warn(
    '[EchoNotes] Supabase Realtime disabled: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env to enable live updates.'
  );
}
