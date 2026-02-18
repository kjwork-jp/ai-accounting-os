import { NextRequest } from 'next/server';
import { requireAuth, ok, badRequest, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { documentsListQuerySchema } from '@/lib/validators/documents';

/**
 * GET /api/v1/documents
 * List documents with filtering, sorting, and pagination.
 * Requires: documents:view (admin, accounting, viewer)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const searchParams = request.nextUrl.searchParams;
  const queryObj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  const parsed = documentsListQuerySchema.safeParse(queryObj);
  if (!parsed.success) {
    return badRequest('クエリパラメータが不正です', parsed.error.issues.map(i => ({
      path: i.path.map(String).join('.'),
      message: i.message,
    })));
  }

  const query = parsed.data;
  const admin = createAdminSupabase();

  // Build query with filters
  let dbQuery = admin
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('tenant_id', result.auth.tenantId);

  if (query.status) {
    dbQuery = dbQuery.eq('status', query.status);
  }
  if (query.document_type) {
    dbQuery = dbQuery.eq('document_type', query.document_type);
  }
  if (query.date_from) {
    dbQuery = dbQuery.gte('document_date', query.date_from);
  }
  if (query.date_to) {
    dbQuery = dbQuery.lte('document_date', query.date_to);
  }
  if (query.amount_min != null) {
    dbQuery = dbQuery.gte('amount', query.amount_min);
  }
  if (query.amount_max != null) {
    dbQuery = dbQuery.lte('amount', query.amount_max);
  }
  if (query.q) {
    dbQuery = dbQuery.ilike('file_name', `%${query.q}%`);
  }

  // Sorting
  const ascending = query.sort_order === 'asc';
  dbQuery = dbQuery.order(query.sort_by, { ascending });

  // Pagination
  const offset = (query.page - 1) * query.per_page;
  dbQuery = dbQuery.range(offset, offset + query.per_page - 1);

  const { data, error, count } = await dbQuery;

  if (error) {
    return internalError(`ドキュメント一覧の取得に失敗しました: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / query.per_page);

  return ok({
    data: data ?? [],
    meta: {
      total,
      page: query.page,
      per_page: query.per_page,
      total_pages: totalPages,
    },
  });
}
