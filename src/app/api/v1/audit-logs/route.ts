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

type AuditLogRow = {
  id: string;
  tenant_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  diff_json: Record<string, unknown>;
  created_at: string;
};

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

  const rows = (data ?? []) as AuditLogRow[];
  if (rows.length === 0) {
    return ok({ data: rows });
  }

  // Fill missing actor/entity display names for both historical and new logs.
  const userIdsToResolve = new Set<string>();
  for (const row of rows) {
    if (!row.actor_name && row.actor_user_id) {
      userIdsToResolve.add(row.actor_user_id);
    }
    if (!row.entity_name && row.entity_type === 'tenant_users' && row.entity_id) {
      userIdsToResolve.add(row.entity_id);
    }
  }

  const resolvedNames = new Map<string, string>();
  const ids = Array.from(userIdsToResolve);
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', ids);

    if (profiles) {
      for (const p of profiles) {
        const name = p.full_name || p.email;
        if (name) resolvedNames.set(p.user_id, name);
      }
    }

    // Fallback to Auth user email when profile is missing
    for (const userId of ids) {
      if (resolvedNames.has(userId)) continue;
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (email) resolvedNames.set(userId, email);
    }
  }

  const enriched = rows.map(row => {
    const actorName = row.actor_name
      ?? (row.actor_user_id ? resolvedNames.get(row.actor_user_id) ?? null : null);

    const entityName = row.entity_name
      ?? (row.entity_type === 'tenant_users' && row.entity_id
        ? resolvedNames.get(row.entity_id) ?? null
        : null);

    return {
      ...row,
      actor_name: actorName,
      entity_name: entityName,
    };
  });

  return ok({ data: enriched });
}
