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

  // Authenticated but no tenant membership
  const tenantUser = await getCurrentTenantUser();
  if (!tenantUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow text-center">
          <h1 className="text-xl font-bold text-gray-900">テナント未割当</h1>
          <p className="mt-4 text-sm text-gray-600">
            ログイン済みですが、テナントに割り当てられていません。
            管理者に連絡してください。
          </p>
          <p className="mt-2 text-xs text-gray-400">User ID: {user.id}</p>
          <form action="/api/v1/auth/logout" method="POST">
            <button
              type="submit"
              className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    );
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
