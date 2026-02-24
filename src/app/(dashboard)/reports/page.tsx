'use client';

import { useState } from 'react';
import { JournalEntryList } from '@/components/journals/journal-entry-list';
import { JournalExportButton } from '@/components/journals/journal-export-button';
import { TrialBalanceTable } from '@/components/reports/trial-balance-table';
import { TaxSummaryTable } from '@/components/reports/tax-summary-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type TabType = 'entries' | 'trial-balance' | 'tax-summary';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('entries');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'entries', label: '仕訳一覧' },
    { id: 'trial-balance', label: '月次試算表' },
    { id: 'tax-summary', label: '消費税集計' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">帳簿・レポート</h1>
          <p className="text-muted-foreground">
            仕訳一覧・月次試算表・消費税集計・CSVエクスポート
          </p>
        </div>
        {activeTab === 'entries' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={exportDateFrom}
              onChange={(e) => setExportDateFrom(e.target.value)}
              className="w-36"
              placeholder="開始日"
            />
            <Input
              type="date"
              value={exportDateTo}
              onChange={(e) => setExportDateTo(e.target.value)}
              className="w-36"
              placeholder="終了日"
            />
            <JournalExportButton dateFrom={exportDateFrom} dateTo={exportDateTo} />
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="rounded-b-none"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'entries' && <JournalEntryList />}
      {activeTab === 'trial-balance' && <TrialBalanceTable />}
      {activeTab === 'tax-summary' && <TaxSummaryTable />}
    </div>
  );
}
