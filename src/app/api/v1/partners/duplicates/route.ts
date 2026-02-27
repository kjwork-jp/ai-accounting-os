import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, badRequest, internalError, parseQuery } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { findDuplicates } from '@/lib/partners/name-matching';
import { z } from 'zod';

const duplicatesQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).default(0.8),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * GET /api/v1/partners/duplicates
 * Detect duplicate partner candidates using name similarity.
 * Requires: partners:manage (admin, accounting)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const queryResult = parseQuery(duplicatesQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { threshold, limit } = queryResult.data;
  const admin = createAdminSupabase();

  // Limit to 500 partners to avoid O(n²) explosion
  const { data: partners, error } = await admin
    .from('partners')
    .select('id, name')
    .eq('tenant_id', result.auth.tenantId)
    .eq('is_active', true)
    .is('merged_into_id', null)
    .order('name')
    .limit(500);

  if (error) {
    return internalError(`取引先一覧の取得に失敗しました: ${error.message}`);
  }

  const candidates = findDuplicates(partners ?? [], threshold).slice(0, limit);

  return ok({
    data: candidates,
    total: candidates.length,
  });
}
