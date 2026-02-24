import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound, badRequest, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/reconciliations/:id/confirm
 * Confirm a reconciliation suggestion.
 * Idempotent: if already confirmed, returns 200 with current state.
 * Requires: admin, accounting
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const { id } = await params;
  const admin = createAdminSupabase();

  // Fetch reconciliation
  const { data: reconciliation, error: fetchError } = await admin
    .from('reconciliations')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (fetchError || !reconciliation) {
    return notFound('突合データが見つかりません');
  }

  // Idempotent: already confirmed
  if (reconciliation.status === 'confirmed') {
    return ok({ data: reconciliation });
  }

  // State transition validation: only 'suggested' can be confirmed
  if (reconciliation.status !== 'suggested') {
    return badRequest(`ステータス「${reconciliation.status}」からは確定できません。suggested のみ確定可能です。`);
  }

  // Update status
  const { data: updated, error: updateError } = await admin
    .from('reconciliations')
    .update({
      status: 'confirmed',
      matched_by: result.auth.userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', result.auth.tenantId)
    .select()
    .single();

  if (updateError || !updated) {
    return internalError(`突合データの更新に失敗しました: ${updateError?.message ?? 'unknown'}`);
  }

  // Audit log
  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'reconciliation.confirm',
    entityType: 'reconciliations',
    entityId: id,
    diffJson: {
      status: { before: 'suggested', after: 'confirmed' },
      payment_id: { before: null, after: reconciliation.payment_id },
      target_id: { before: null, after: reconciliation.target_id },
    },
    requestId: getRequestId(request),
  });

  return ok({ data: updated });
}
