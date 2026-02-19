import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentTenantUser } from '@/lib/auth/helpers';
import { JournalDraftList } from '@/components/journals/journal-draft-list';

export default async function JournalsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenantUser = await getCurrentTenantUser();
  if (!tenantUser) redirect('/login');

  // Check role — only admin and accounting can access
  if (tenantUser.role !== 'admin' && tenantUser.role !== 'accounting') {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI仕訳管理</h1>
        <p className="text-muted-foreground">
          証憑から自動生成された仕訳候補の確認・確定を行います
        </p>
      </div>
      <JournalDraftList />
    </div>
  );
}
