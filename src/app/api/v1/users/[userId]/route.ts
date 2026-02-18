import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, notFound, parseBody, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog, computeDiff } from '@/lib/audit/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const { userId } = await params;
  const patchSchema = z.object({
    role: z.enum(['admin', 'accounting', 'viewer', 'approver', 'sales']).optional(),
    is_active: z.boolean().optional(),
    custom_role_id: z.string().uuid().nullable().optional(),
  });

  const body = await request.json();
  const parsed = parseBody(patchSchema, body);
  if ('error' in parsed) return parsed.error;

  const supabase = createAdminSupabase();

  const { data: current } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .eq('user_id', userId)
    .single();

  if (!current) return notFound('User not found in this tenant');

  const { data, error } = await supabase
    .from('tenant_users')
    .update(parsed.data)
    .eq('tenant_id', result.auth.tenantId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return internalError(error.message);

  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'update',
    entityType: 'tenant_users',
    entityId: userId,
    diffJson: computeDiff(current as Record<string, unknown>, data as Record<string, unknown>),
  });

  return ok(data);
}
