import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Session-based Supabase client (anon key + user cookies).
 * Respects RLS. Use for auth checks and user-scoped queries.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cs) {
          cs.forEach((c) => cookieStore.set(c.name, c.value, c.options))
        },
      },
    }
  )
}

/**
 * Admin Supabase client (service_role key).
 * Bypasses RLS. Use for admin-level queries after auth is verified.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
