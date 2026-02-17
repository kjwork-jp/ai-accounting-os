import { createServerSupabase } from '@/lib/supabase/server';
import type { UserRole, TenantUser, Profile } from '@/types/database';

/**
 * Get current user's tenant membership from server context.
 * Returns null if not authenticated or no active membership.
 */
export async function getCurrentTenantUser(): Promise<
  (TenantUser & { profile: Profile | null }) | null
> {
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!tenantUser) return null;

  // Fetch profile separately to avoid FK join issues between tenant_users and profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return {
    tenant_id: tenantUser.tenant_id,
    user_id: tenantUser.user_id,
    role: tenantUser.role as UserRole,
    is_active: tenantUser.is_active,
    created_at: tenantUser.created_at,
    updated_at: tenantUser.updated_at,
    profile: (profile as Profile) ?? null,
  };
}

/**
 * RBAC: check if a role has access to a feature.
 * Role hierarchy: admin > accounting > approver ≈ sales > viewer
 */
const ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  'users:manage': ['admin'],
  'tenant:settings': ['admin'],
  'documents:upload': ['admin', 'accounting'],
  'documents:view': ['admin', 'accounting', 'viewer'],
  'journals:confirm': ['admin', 'accounting'],
  'journals:view': ['admin', 'accounting', 'viewer'],
  'partners:manage': ['admin', 'accounting'],
  'partners:view': ['admin', 'accounting', 'viewer'],
  'orders:manage': ['admin', 'accounting', 'sales'],
  'invoices:manage': ['admin', 'accounting', 'sales'],
  'approvals:create': ['admin', 'accounting', 'approver', 'sales'],
  'approvals:approve': ['admin', 'approver'],
  'approvals:view': ['admin', 'accounting', 'approver', 'sales', 'viewer'],
  'reports:view': ['admin', 'accounting', 'viewer'],
  'audit:view': ['admin', 'accounting'],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  const allowed = ROLE_PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}
