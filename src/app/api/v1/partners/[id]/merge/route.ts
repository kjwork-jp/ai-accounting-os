import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound, badRequest, internalError, parseBody, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { partnerMergeSchema } from '@/lib/validators/partners';
import { insertAuditLog } from '@/lib/audit/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/partners/:id/merge
 * Merge other partners into this partner.
 * Requires: admin role only (destructive operation).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin']);
  if (roleError) return roleError;

  const { id: targetId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseBody(partnerMergeSchema, body);
  if ('error' in parsed) return parsed.error;

  const { merge_from_ids } = parsed.data;
  const admin = createAdminSupabase();

  // Verify target partner exists
  const { data: target, error: targetError } = await admin
    .from('partners')
    .select('*')
    .eq('id', targetId)
    .eq('tenant_id', result.auth.tenantId)
    .is('merged_into_id', null)
    .single();

  if (targetError || !target) {
    return notFound('統合先の取引先が見つかりません');
  }

  // Verify all source partners exist and belong to same tenant
  const { data: sources, error: sourcesError } = await admin
    .from('partners')
    .select('id, name')
    .eq('tenant_id', result.auth.tenantId)
    .in('id', merge_from_ids)
    .is('merged_into_id', null);

  if (sourcesError) {
    return internalError('統合元の取引先の取得に失敗しました');
  }

  const foundIds = new Set(sources?.map(s => s.id) ?? []);
  const missingIds = merge_from_ids.filter(id => !foundIds.has(id));
  if (missingIds.length > 0) {
    return notFound(`統合元の取引先が見つかりません: ${missingIds.join(', ')}`);
  }

  // Prevent self-merge
  if (merge_from_ids.includes(targetId)) {
    return badRequest('統合先と統合元に同じ取引先を指定できません');
  }

  // Update source partners: set merged_into_id and is_active=false
  // Concurrency guard: only update partners that are not already merged
  const { error: mergeError, count: mergedCount } = await admin
    .from('partners')
    .update({ merged_into_id: targetId, is_active: false })
    .in('id', merge_from_ids)
    .eq('tenant_id', result.auth.tenantId)
    .is('merged_into_id', null); // Only merge if not already merged

  if (mergeError) {
    return internalError(`取引先の統合に失敗しました: ${mergeError.message}`);
  }

  // Update journal_lines references
  const { error: journalError } = await admin
    .from('journal_lines')
    .update({ partner_id: targetId })
    .in('partner_id', merge_from_ids)
    .eq('tenant_id', result.auth.tenantId);

  if (journalError) {
    console.error('[partner-merge] journal_lines update failed:', journalError.message);
  }

  // Audit log
  const sourceNames = sources?.map(s => s.name) ?? [];
  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'partner.merge',
    entityType: 'partners',
    entityId: targetId,
    entityName: target.name,
    diffJson: {
      merged_from: { before: null, after: merge_from_ids },
      merged_from_names: { before: null, after: sourceNames },
    },
    requestId: getRequestId(request),
  });

  return ok({
    data: {
      merged_into_id: targetId,
      merged_into_name: target.name,
      merged_count: merge_from_ids.length,
      merged_from_names: sourceNames,
    },
  });
}
