import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, ok, created, parseBody } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';

  const supabase = createAdminSupabase();
  let query = supabase
    .from('m_accounts')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .order('code');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return ok({ data: [], error: error.message });

  return ok({ data });
}

const createSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  category: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parent_code: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const { requireRole } = await import('@/lib/api/helpers');
  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await request.json();
  const parsed = parseBody(createSchema, body);
  if ('error' in parsed) return parsed.error;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from('m_accounts')
    .insert({
      tenant_id: result.auth.tenantId,
      code: parsed.data.code,
      name: parsed.data.name,
      category: parsed.data.category,
      parent_code: parsed.data.parent_code ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const { conflict } = await import('@/lib/api/helpers');
      return conflict(`Account code '${parsed.data.code}' already exists`);
    }
    const { internalError } = await import('@/lib/api/helpers');
    return internalError(error.message);
  }

  return created(data);
}
