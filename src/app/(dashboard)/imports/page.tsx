'use client';

import { AccountingCsvImport } from '@/components/imports/accounting-csv-import';

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">会計CSV取込</h1>
        <p className="text-muted-foreground">
          弥生会計・freee・Money Forward等の会計ソフトから仕訳データをCSVで取り込みます
        </p>
      </div>
      <AccountingCsvImport />
    </div>
  );
}
