import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { findDuplicates } from '@/lib/partners/name-matching';

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

  const admin = createAdminSupabase();

  const { data: partners, error } = await admin
    .from('partners')
    .select('id, name')
    .eq('tenant_id', result.auth.tenantId)
    .eq('is_active', true)
    .is('merged_into_id', null)
    .order('name');

  if (error) {
    return internalError(`取引先一覧の取得に失敗しました: ${error.message}`);
  }

  const threshold = Number(request.nextUrl.searchParams.get('threshold') || '0.8');
  const candidates = findDuplicates(partners ?? [], threshold);

  return ok({
    data: candidates,
    total: candidates.length,
  });
}
