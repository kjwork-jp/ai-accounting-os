import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const { userId } = await params;
  const supabase = createAdminSupabase();

  const { data: current } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .eq('user_id', userId)
    .single();

  if (!current) return notFound('User not found in this tenant');

  const { error } = await supabase
    .from('tenant_users')
    .update({ is_active: false })
    .eq('tenant_id', result.auth.tenantId)
    .eq('user_id', userId);

  if (error) return internalError(error.message);

  await insertAuditLog({
    tenantId: result.auth.tenantId,
    action: 'disable',
    entityType: 'tenant_users',
    entityId: userId,
  });

  return ok({ success: true });
}
