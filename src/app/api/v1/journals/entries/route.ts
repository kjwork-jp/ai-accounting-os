import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, parseQuery, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { journalEntriesQuerySchema } from '@/lib/validators/journals';

/**
 * GET /api/v1/journals/entries
 * List confirmed journal entries with filtering and pagination.
 * Requires: journals:view (admin, accounting)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const queryResult = parseQuery(journalEntriesQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { page, per_page, status, source_type, date_from, date_to } = queryResult.data;
  const admin = createAdminSupabase();

  let query = admin
    .from('journal_entries')
    .select('*, journal_lines(*)', { count: 'exact' })
    .eq('tenant_id', result.auth.tenantId)
    .order('entry_date', { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  if (status) {
    query = query.eq('status', status);
  }
  if (source_type) {
    query = query.eq('source_type', source_type);
  }
  if (date_from) {
    query = query.gte('entry_date', date_from);
  }
  if (date_to) {
    query = query.lte('entry_date', date_to);
  }

  const { data, error, count } = await query;

  if (error) {
    return internalError(error.message);
  }

  return ok({
    data: data ?? [],
    pagination: {
      page,
      per_page,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / per_page),
    },
  });
}
