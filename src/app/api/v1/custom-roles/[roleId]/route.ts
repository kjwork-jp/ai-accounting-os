import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, notFound, parseBody, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { VALID_PERMISSIONS } from '@/lib/auth/helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const { roleId } = await params;
  const patchSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(200).optional(),
    base_role: z.enum(['admin', 'accounting', 'viewer', 'approver', 'sales']).optional(),
    permissions: z.array(z.string()).optional(),
    is_active: z.boolean().optional(),
  });

  const body = await request.json();
  const parsed = parseBody(patchSchema, body);
  if ('error' in parsed) return parsed.error;

  if (parsed.data.permissions) {
    const invalid = parsed.data.permissions.filter(p => !VALID_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      return internalError(`Invalid permissions: ${invalid.join(', ')}`);
    }
  }

  const admin = createAdminSupabase();

  const { data: current } = await admin
    .from('tenant_custom_roles')
    .select('*')
    .eq('id', roleId)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (!current) return notFound('Custom role not found');

  const { data, error } = await admin
    .from('tenant_custom_roles')
    .update(parsed.data)
    .eq('id', roleId)
    .eq('tenant_id', result.auth.tenantId)
    .select()
    .single();

  if (error) return internalError(error.message);
  return ok(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const { roleId } = await params;
  const admin = createAdminSupabase();

  const { error } = await admin
    .from('tenant_custom_roles')
    .delete()
    .eq('id', roleId)
    .eq('tenant_id', result.auth.tenantId);

  if (error) return internalError(error.message);
  return ok({ success: true });
}
