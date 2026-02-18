import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, ok, created, parseBody, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleCheck = requireRole(result.auth, ['admin']);
  if (roleCheck) return roleCheck;

  // Use admin client to bypass RLS for cross-user tenant query
  const admin = createAdminSupabase();

  const { data: tenantUsers, error } = await admin
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at');

  if (error) return ok({ data: [], error: error.message });

  // Fetch profiles separately to avoid FK join issues
  const userIds = tenantUsers.map(tu => tu.user_id);
  let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', userIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map(p => [p.user_id, { full_name: p.full_name, email: p.email }])
      );
    }
  }

  // Merge profiles into tenant_users
  const data = tenantUsers.map(tu => ({
    ...tu,
    profiles: profileMap[tu.user_id] ?? null,
  }));

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

  const admin = createAdminSupabase();

  // Check if user exists by email in profiles
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', parsed.data.email)
    .single();

  if (!existingProfile) {
    return internalError(
      'このメールアドレスのユーザーが見つかりません。先にサインアップが必要です。'
    );
  }

  const { data, error } = await admin
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
