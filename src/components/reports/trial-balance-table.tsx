'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface AccountRow {
  code: string;
  name: string;
  category: string;
  debit_total: number;
  credit_total: number;
  balance: number;
  prev_balance?: number;
}

interface TrialBalanceData {
  year_month: string;
  accounts: AccountRow[];
  summary: {
    total_debit: number;
    total_credit: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  asset: '資産',
  liability: '負債',
  equity: '純資産',
  revenue: '収益',
  expense: '費用',
};

const CATEGORY_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export function TrialBalanceTable() {
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [comparison, setComparison] = useState(false);
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year_month: yearMonth });
      if (comparison) params.set('comparison', 'true');

      const res = await fetch(`/api/v1/reports/trial-balance?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [yearMonth, comparison]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ja-JP').format(amount);

  // Group accounts by category
  const groupedAccounts = data
    ? CATEGORY_ORDER
        .map((cat) => ({
          category: cat,
          label: CATEGORY_LABELS[cat] || cat,
          accounts: data.accounts.filter((a) => a.category === cat),
        }))
        .filter((g) => g.accounts.length > 0)
    : [];

  return (
    <Card>
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-44"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={comparison}
              onChange={(e) => setComparison(e.target.checked)}
              className="rounded"
            />
            前月比較
          </label>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? '読み込み中...' : '更新'}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>科目コード</TableHead>
            <TableHead>科目名</TableHead>
            <TableHead className="text-right">借方合計</TableHead>
            <TableHead className="text-right">貸方合計</TableHead>
            <TableHead className="text-right">残高</TableHead>
            {comparison && <TableHead className="text-right">前月残高</TableHead>}
            {comparison && <TableHead className="text-right">増減</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={comparison ? 7 : 5} className="text-center py-8 text-muted-foreground">
                読み込み中...
              </TableCell>
            </TableRow>
          ) : !data || data.accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={comparison ? 7 : 5} className="text-center py-8 text-muted-foreground">
                データがありません
              </TableCell>
            </TableRow>
          ) : (
            <>
              {groupedAccounts.map((group) => (
                <>
                  <TableRow key={`cat-${group.category}`} className="bg-muted/50">
                    <TableCell colSpan={comparison ? 7 : 5} className="font-semibold">
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.accounts.map((account) => (
                    <TableRow key={account.code}>
                      <TableCell className="pl-8 font-mono text-sm">{account.code}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell className="text-right font-mono">{formatAmount(account.debit_total)}</TableCell>
                      <TableCell className="text-right font-mono">{formatAmount(account.credit_total)}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{formatAmount(account.balance)}</TableCell>
                      {comparison && (
                        <>
                          <TableCell className="text-right font-mono">{formatAmount(account.prev_balance ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={account.balance - (account.prev_balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatAmount(account.balance - (account.prev_balance ?? 0))}
                            </span>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </>
              ))}
              {data.summary && (
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={2}>合計</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(data.summary.total_debit)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(data.summary.total_credit)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(data.summary.total_debit - data.summary.total_credit)}</TableCell>
                  {comparison && <TableCell colSpan={2} />}
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
