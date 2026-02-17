import Link from 'next/link';
import {
  FileText,
  BookOpen,
  Receipt,
  CheckSquare,
  BarChart3,
  Users,
} from 'lucide-react';

const QUICK_ACTIONS = [
  { label: '証憑アップロード', href: '/documents', icon: FileText, color: 'bg-blue-50 text-blue-700' },
  { label: '仕訳確認', href: '/journals', icon: BookOpen, color: 'bg-green-50 text-green-700' },
  { label: '請求書', href: '/invoices', icon: Receipt, color: 'bg-purple-50 text-purple-700' },
  { label: '決裁', href: '/approvals', icon: CheckSquare, color: 'bg-orange-50 text-orange-700' },
  { label: '経営分析', href: '/analytics', icon: BarChart3, color: 'bg-cyan-50 text-cyan-700' },
  { label: '取引先', href: '/partners', icon: Users, color: 'bg-pink-50 text-pink-700' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK_ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-lg border bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
            >
              <div className={`rounded-lg p-2 ${action.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-gray-700">{action.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Placeholder KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '未確定仕訳', value: '-', sub: '要確認' },
          { label: '未収金', value: '-', sub: '件' },
          { label: '未払金', value: '-', sub: '件' },
          { label: '承認待ち', value: '-', sub: '件' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
