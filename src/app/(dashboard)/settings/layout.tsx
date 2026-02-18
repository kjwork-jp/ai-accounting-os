import Link from 'next/link';

const TABS = [
  { label: 'セキュリティ', href: '/settings' },
  { label: 'ユーザー管理', href: '/settings/users' },
  { label: 'カスタムロール', href: '/settings/roles' },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          アカウントセキュリティとユーザー管理
        </p>
      </div>
      <nav className="flex gap-4 border-b">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className="border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 [&.active]:border-blue-500 [&.active]:text-blue-600"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
