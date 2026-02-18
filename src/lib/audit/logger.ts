import { createAdminSupabase } from '@/lib/supabase/server';

interface AuditLogParams {
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string;
  diffJson?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Insert audit log via RPC (security definer function).
 * Falls back to direct insert if RPC not available.
 * See DB設計書 09_監査ログ設計.
 */
export async function insertAuditLog(params: AuditLogParams): Promise<string | null> {
  const supabase = createAdminSupabase();

  // Try RPC first (security definer, ensures actor_user_id is set correctly)
  const { data, error } = await supabase.rpc('insert_audit_log', {
    p_tenant_id: params.tenantId,
    p_action: params.action,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId ?? null,
    p_diff_json: params.diffJson ?? {},
    p_request_id: params.requestId ?? null,
  });

  if (error) {
    // RPC may not be deployed yet; log error but don't fail the request
    console.error('[audit] insert_audit_log RPC failed:', error.message);
    return null;
  }

  return data as string;
}

/**
 * Compute diff between old and new objects for audit logging.
 */
export function computeDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of Object.keys(newObj)) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { before: oldVal, after: newVal };
    }
  }

  return diff;
}
