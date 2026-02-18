import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, parseQuery } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  actor: z.string().optional(),
  action: z.string().optional(),
  entity_type: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin', 'accounting']);
  if (roleCheck) return roleCheck;

  const qResult = parseQuery(querySchema, request.nextUrl.searchParams);
  if ('error' in qResult) return qResult.error;
  const q = qResult.data;

  const supabase = createAdminSupabase();
  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at', { ascending: false });

  if (q.from) query = query.gte('created_at', q.from);
  if (q.to) query = query.lte('created_at', q.to);
  if (q.actor) query = query.eq('actor_user_id', q.actor);
  if (q.action) query = query.eq('action', q.action);
  if (q.entity_type) query = query.eq('entity_type', q.entity_type);

  const limit = q.limit ? parseInt(q.limit, 10) : 50;
  const offset = q.offset ? parseInt(q.offset, 10) : 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    return ok({ data: [], error: error.message });
  }

  return ok({ data });
}
