'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, LogOut } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tenantName }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message ?? 'テナントの作成に失敗しました');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-lg space-y-8 rounded-lg bg-white p-8 shadow">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-blue-600" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            テナントセットアップ
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            組織（テナント）を作成してAI Accounting OSを開始しましょう。
          </p>
        </div>

        {error && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleCreateTenant} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">組織名（会社名）</Label>
            <Input
              id="tenant-name"
              type="text"
              required
              value={tenantName}
              onChange={e => setTenantName(e.target.value)}
              placeholder="株式会社サンプル"
              maxLength={100}
            />
          </div>

          <Button type="submit" disabled={loading || !tenantName.trim()} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                作成中...
              </>
            ) : (
              'テナントを作成して開始'
            )}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">または</span>
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-600">
            既存テナントへの招待を待っている場合は、管理者がユーザー管理画面から
            あなたを追加するのをお待ちください。追加後にダッシュボードへアクセスできます。
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              router.push('/dashboard');
              router.refresh();
            }}
          >
            招待済みの方はこちら
          </Button>
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            ログアウト
          </Button>
        </div>
      </div>
    </div>
  );
}
