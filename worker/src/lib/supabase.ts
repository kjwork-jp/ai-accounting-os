import { createClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client for Worker (service_role key).
 * Bypasses RLS — Worker is a trusted backend process.
 */
export function createWorkerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
