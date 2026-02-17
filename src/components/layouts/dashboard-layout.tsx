'use client';

import { useState } from 'react';
import { SidebarNav } from './sidebar-nav';
import { Header } from './header';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/database';

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string | null;
  tenantName: string | null;
}

export function DashboardLayout({
  children,
  role,
  userName,
  tenantName,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 transform border-r bg-white transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-sm font-bold text-gray-900">AIBO</span>
        </div>
        <SidebarNav role={role} />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userName={userName}
          tenantName={tenantName}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
