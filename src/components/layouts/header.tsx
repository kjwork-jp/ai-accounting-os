'use client';

import { useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  userName: string | null;
  tenantName: string | null;
  onToggleSidebar?: () => void;
}

export function Header({ userName, tenantName, onToggleSidebar }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-gray-900">
          {tenantName ?? 'AI Accounting OS'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          {userName}
        </span>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
