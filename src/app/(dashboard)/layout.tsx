import { redirect } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { getCurrentTenantUser } from '@/lib/auth/helpers';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Not authenticated → login
  if (!user) {
    redirect('/login');
  }

  // Authenticated but no tenant membership → onboarding
  const tenantUser = await getCurrentTenantUser();
  if (!tenantUser) {
    redirect('/onboarding');
  }

  return (
    <DashboardLayout
      role={tenantUser.role}
      userName={tenantUser.profile?.full_name ?? tenantUser.profile?.email ?? null}
      tenantName={null}
    >
      {children}
    </DashboardLayout>
  );
}
