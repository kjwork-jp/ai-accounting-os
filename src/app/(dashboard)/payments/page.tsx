'use client';

import { useState } from 'react';
import { CsvImportForm } from '@/components/payments/csv-import-form';
import { ReconciliationList } from '@/components/payments/reconciliation-list';
import { Button } from '@/components/ui/button';

type TabType = 'import' | 'reconciliation';

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('import');
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'import', label: '明細取込' },
    { id: 'reconciliation', label: '突合' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">明細取込・突合</h1>
        <p className="text-muted-foreground">
          銀行・クレカ明細のCSV取込と仕訳との突合を行います
        </p>
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

      {activeTab === 'import' && (
        <CsvImportForm onImportComplete={() => setRefreshKey((k) => k + 1)} />
      )}
      {activeTab === 'reconciliation' && (
        <ReconciliationList key={refreshKey} />
      )}
    </div>
  );
}
