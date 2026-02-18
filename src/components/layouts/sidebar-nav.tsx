'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  ShoppingCart,
  Package,
  Receipt,
  CheckSquare,
  BarChart3,
  Users,
  ClipboardList,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/database';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { label: '証憑管理', href: '/documents', icon: FileText, roles: ['admin', 'accounting', 'viewer'] },
  { label: '仕訳', href: '/journals', icon: BookOpen, roles: ['admin', 'accounting', 'viewer'] },
  { label: '受注', href: '/sales-orders', icon: ShoppingCart, roles: ['admin', 'accounting', 'sales'] },
  { label: '発注', href: '/purchase-orders', icon: Package, roles: ['admin', 'accounting'] },
  { label: '請求書', href: '/invoices', icon: Receipt, roles: ['admin', 'accounting', 'sales'] },
  { label: '決裁', href: '/approvals', icon: CheckSquare },
  { label: '経営分析', href: '/analytics', icon: BarChart3, roles: ['admin', 'accounting', 'viewer'] },
  { label: '取引先', href: '/partners', icon: Users, roles: ['admin', 'accounting', 'viewer'] },
  { label: '監査ログ', href: '/audit-logs', icon: ClipboardList, roles: ['admin', 'accounting'] },
  { label: '設定', href: '/settings', icon: Settings, roles: ['admin'] },
];

interface SidebarNavProps {
  role: UserRole;
}

export function SidebarNav({ role }: SidebarNavProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {visibleItems.map(item => {
        const Icon = item.icon;
        const isActive = pathname === item.href ||
          pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
