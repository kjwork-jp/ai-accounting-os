import { NextRequest } from 'next/server';
import { requireAuth, ok, notFound } from '@/lib/api/helpers';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', result.auth.tenantId)
    .single();

  if (error || !data) return notFound('Tenant not found');

  return ok(data);
}
