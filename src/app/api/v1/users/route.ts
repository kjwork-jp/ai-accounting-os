import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, created, parseBody, internalError } from '@/lib/api/helpers';
import { createServerSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('tenant_users')
    .select('*, profiles(*)')
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at');

  if (error) return ok({ data: [], error: error.message });
  return ok({ data });
}

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(['admin', 'accounting', 'viewer', 'approver', 'sales']),
});

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  const body = await request.json();
  const parsed = parseBody(createSchema, body);
  if ('error' in parsed) return parsed.error;

  // Note: In MVP, user creation is done via Supabase Auth invite
  // This endpoint creates the tenant_users entry for an existing auth user
  // Full invite flow would use Supabase Admin API with service_role
  const supabase = await createServerSupabase();

  // Check if user already exists in auth (by email, via profiles)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('email', parsed.data.email)
    .single();

  if (!existingProfile) {
    return internalError(
      'User must first sign up. Invite flow via Supabase Admin API is required for production.'
    );
  }

  const { data, error } = await supabase
    .from('tenant_users')
    .insert({
      tenant_id: result.auth.tenantId,
      user_id: existingProfile.user_id,
      role: parsed.data.role,
    })
    .select()
    .single();

  if (error) return internalError(error.message);

  await insertAuditLog({
    tenantId: result.auth.tenantId,
    action: 'create',
    entityType: 'tenant_users',
    entityId: existingProfile.user_id,
  });

  return created(data);
}
