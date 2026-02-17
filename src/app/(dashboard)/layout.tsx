import { redirect } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { getCurrentTenantUser } from '@/lib/auth/helpers';

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantUser = await getCurrentTenantUser();

  if (!tenantUser) {
    redirect('/login');
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
