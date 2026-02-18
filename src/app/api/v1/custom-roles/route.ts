import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, created, parseBody, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { VALID_PERMISSIONS } from '@/lib/auth/helpers';
import { insertAuditLog } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('tenant_custom_roles')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .order('name');

  if (error) return ok({ data: [] });
  return ok({ data });
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  base_role: z.enum(['admin', 'accounting', 'viewer', 'approver', 'sales']),
  permissions: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await request.json();
  const parsed = parseBody(createSchema, body);
  if ('error' in parsed) return parsed.error;

  // Validate permission strings
  const invalid = parsed.data.permissions.filter(p => !VALID_PERMISSIONS.includes(p));
  if (invalid.length > 0) {
    return internalError(`Invalid permissions: ${invalid.join(', ')}`);
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('tenant_custom_roles')
    .insert({
      tenant_id: result.auth.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      base_role: parsed.data.base_role,
      permissions: parsed.data.permissions,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return internalError('同じ名前のカスタムロールが既に存在します');
    }
    return internalError(error.message);
  }

  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'create',
    entityType: 'tenant_custom_roles',
    entityId: data.id,
    entityName: data.name,
  });

  return created(data);
}
