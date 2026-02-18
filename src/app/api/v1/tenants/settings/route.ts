import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, parseBody, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog, computeDiff } from '@/lib/audit/logger';

const patchSchema = z.object({
  auto_confirm_high: z.number().min(0).max(1).optional(),
  auto_confirm_mid: z.number().min(0).max(1).optional(),
  ai_daily_cost_limit_jpy: z.number().min(0).optional(),
});

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .single();

  return ok(data);
}

export async function PATCH(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await request.json();
  const parsed = parseBody(patchSchema, body);
  if ('error' in parsed) return parsed.error;

  const supabase = createAdminSupabase();

  // Get current for diff
  const { data: current } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .single();

  const { data, error } = await supabase
    .from('tenant_settings')
    .update(parsed.data)
    .eq('tenant_id', result.auth.tenantId)
    .select()
    .single();

  if (error) return internalError(error.message);

  // Audit log
  if (current) {
    await insertAuditLog({
      tenantId: result.auth.tenantId,
      actorUserId: result.auth.userId,
      action: 'update',
      entityType: 'tenant_settings',
      entityId: result.auth.tenantId,
      diffJson: computeDiff(current as Record<string, unknown>, data as Record<string, unknown>),
    });
  }

  return ok(data);
}
