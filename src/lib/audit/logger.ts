import { createAdminSupabase } from '@/lib/supabase/server';

interface AuditLogParams {
  tenantId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  diffJson?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Insert audit log with actor and entity information.
 * Uses direct insert with admin client to ensure actor_user_id
 * and actor_name are always populated correctly.
 * See DB設計書 09_監査ログ設計.
 */
export async function insertAuditLog(params: AuditLogParams): Promise<string | null> {
  const supabase = createAdminSupabase();

  // Look up actor name from profiles
  let actorName: string | null = null;
  if (params.actorUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', params.actorUserId)
      .single();
    actorName = profile?.full_name || profile?.email || null;
  }

  // Look up entity name if not provided
  let entityName = params.entityName ?? null;
  if (!entityName && params.entityId) {
    entityName = await resolveEntityName(supabase, params.entityType, params.entityId);
  }

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      tenant_id: params.tenantId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      entity_name: entityName,
      actor_user_id: params.actorUserId,
      actor_name: actorName,
      diff_json: params.diffJson ?? {},
      request_id: params.requestId ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[audit] insert failed:', error.message);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Resolve a human-readable name for an entity based on type and ID.
 */
async function resolveEntityName(
  supabase: ReturnType<typeof createAdminSupabase>,
  entityType: string,
  entityId: string
): Promise<string | null> {
  switch (entityType) {
    case 'tenant_users': {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', entityId)
        .single();
      return data?.full_name || data?.email || null;
    }
    case 'tenant_settings':
    case 'tenants': {
      const { data } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', entityId)
        .single();
      return data?.name || null;
    }
    case 'tenant_custom_roles': {
      const { data } = await supabase
        .from('tenant_custom_roles')
        .select('name')
        .eq('id', entityId)
        .single();
      return data?.name || null;
    }
    case 'partners': {
      const { data } = await supabase
        .from('partners')
        .select('name')
        .eq('id', entityId)
        .single();
      return data?.name || null;
    }
    case 'documents': {
      const { data } = await supabase
        .from('documents')
        .select('file_name')
        .eq('id', entityId)
        .single();
      return data?.file_name || null;
    }
    default:
      return null;
  }
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
