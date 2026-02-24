import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound, badRequest, internalError, parseBody, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { partnerUpdateSchema } from '@/lib/validators/partners';
import { insertAuditLog, computeDiff } from '@/lib/audit/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/partners/:id
 * Get partner detail.
 * Requires: partners:view (admin, accounting, viewer)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const { id } = await params;
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .from('partners')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (error || !data) {
    return notFound('取引先が見つかりません');
  }

  return ok({ data });
}

/**
 * PATCH /api/v1/partners/:id
 * Update partner with optimistic locking (updated_at).
 * Requires: partners:manage (admin, accounting)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseBody(partnerUpdateSchema, body);
  if ('error' in parsed) return parsed.error;

  const { updated_at: expectedUpdatedAt, ...updateFields } = parsed.data;
  const admin = createAdminSupabase();

  // Fetch current state for diff and optimistic lock
  const { data: current, error: fetchError } = await admin
    .from('partners')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (fetchError || !current) {
    return notFound('取引先が見つかりません');
  }

  // Optimistic lock check
  if (current.updated_at !== expectedUpdatedAt) {
    const { conflict } = await import('@/lib/api/helpers');
    return conflict('他のユーザーによって更新されています。最新データを取得してください。');
  }

  // Build update payload (only provided fields)
  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updateFields)) {
    if (value !== undefined) {
      updatePayload[key] = value;
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return ok({ data: current });
  }

  const { data, error } = await admin
    .from('partners')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', result.auth.tenantId)
    .eq('updated_at', expectedUpdatedAt) // optimistic lock
    .select()
    .single();

  if (error || !data) {
    const { conflict } = await import('@/lib/api/helpers');
    return conflict('更新に失敗しました。データが変更されている可能性があります。');
  }

  // Audit log with diff
  const diff = computeDiff(
    current as unknown as Record<string, unknown>,
    data as unknown as Record<string, unknown>
  );

  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'partner.update',
    entityType: 'partners',
    entityId: id,
    entityName: data.name,
    diffJson: diff,
    requestId: getRequestId(request),
  });

  return ok({ data });
}
