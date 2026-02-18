import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import type { UserRole, TenantUser, TenantCustomRole, Profile } from '@/types/database';

/**
 * Get current user's tenant membership from server context.
 * Returns null if not authenticated or no active membership.
 */
export async function getCurrentTenantUser(): Promise<
  (TenantUser & { profile: Profile | null; customRole: TenantCustomRole | null }) | null
> {
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use admin client to avoid RLS issues
  const admin = createAdminSupabase();

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!tenantUser) return null;

  // Fetch profile separately
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Fetch custom role if assigned
  let customRole: TenantCustomRole | null = null;
  if (tenantUser.custom_role_id) {
    const { data } = await admin
      .from('tenant_custom_roles')
      .select('*')
      .eq('id', tenantUser.custom_role_id)
      .single();
    customRole = data as TenantCustomRole | null;
  }

  return {
    tenant_id: tenantUser.tenant_id,
    user_id: tenantUser.user_id,
    role: tenantUser.role as UserRole,
    custom_role_id: tenantUser.custom_role_id ?? null,
    is_active: tenantUser.is_active,
    created_at: tenantUser.created_at,
    updated_at: tenantUser.updated_at,
    profile: (profile as Profile) ?? null,
    customRole,
  };
}

/**
 * All valid permission strings in the system.
 */
export const VALID_PERMISSIONS = [
  'users:manage',
  'tenant:settings',
  'custom_roles:manage',
  'documents:upload',
  'documents:view',
  'journals:confirm',
  'journals:view',
  'partners:manage',
  'partners:view',
  'orders:manage',
  'invoices:manage',
  'approvals:create',
  'approvals:approve',
  'approvals:view',
  'reports:view',
  'audit:view',
];

/**
 * RBAC: base role permission mapping.
 * Role hierarchy: admin > accounting > approver ≈ sales > viewer
 */
const ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  'users:manage': ['admin'],
  'tenant:settings': ['admin'],
  'custom_roles:manage': ['admin'],
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

/**
 * Check permission with custom role support.
 * Effective permissions = base role permissions + custom role extra permissions.
 */
export function hasPermission(
  role: UserRole,
  permission: string,
  customRole?: TenantCustomRole | null
): boolean {
  // Check base role
  const allowed = ROLE_PERMISSIONS[permission];
  if (allowed && allowed.includes(role)) return true;

  // Check custom role extra permissions
  if (customRole?.permissions?.includes(permission)) return true;

  return false;
}
