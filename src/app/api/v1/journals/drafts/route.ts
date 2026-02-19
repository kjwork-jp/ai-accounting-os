import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, parseQuery, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { journalDraftsQuerySchema } from '@/lib/validators/journals';

/**
 * GET /api/v1/journals/drafts
 * List journal drafts with filtering and pagination.
 * Requires: journals:view (admin, accounting)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const queryResult = parseQuery(journalDraftsQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { page, per_page, status, document_id } = queryResult.data;
  const admin = createAdminSupabase();

  let query = admin
    .from('journal_drafts')
    .select('*, documents(id, file_name, document_type, amount, document_date)', { count: 'exact' })
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at', { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  if (status) {
    query = query.eq('status', status);
  }
  if (document_id) {
    query = query.eq('document_id', document_id);
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
