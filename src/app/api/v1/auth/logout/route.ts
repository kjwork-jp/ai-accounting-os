import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

async function handleLogout(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();

  // If called from a form, redirect to login
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/html')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  return handleLogout(request);
}
