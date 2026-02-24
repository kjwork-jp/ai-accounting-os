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

interface TaxRateRow {
  tax_code: string;
  rate: number;
  taxable_sales: number;
  tax_on_sales: number;
  taxable_purchases: number;
  tax_on_purchases: number;
  net_tax: number;
}

interface TaxSummaryData {
  period: { from: string; to: string };
  tax_rates: TaxRateRow[];
  total: {
    taxable_sales: number;
    total_tax_on_sales: number;
    taxable_purchases: number;
    total_tax_on_purchases: number;
    net_tax_payable: number;
  };
}

const TAX_CODE_LABELS: Record<string, string> = {
  TAX10: '10%課税',
  TAX8: '8%軽減',
  NONTAX: '非課税',
  EXEMPT: '免税',
};

export function TaxSummaryTable() {
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lastDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(lastDayStr);
  const [data, setData] = useState<TaxSummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const res = await fetch(`/api/v1/reports/tax-summary?${params}`);
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
  }, [dateFrom, dateTo]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ja-JP').format(amount);

  return (
    <Card>
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          <span className="text-muted-foreground">〜</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? '読み込み中...' : '更新'}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>税区分</TableHead>
            <TableHead>税率</TableHead>
            <TableHead className="text-right">課税売上</TableHead>
            <TableHead className="text-right">売上税額</TableHead>
            <TableHead className="text-right">課税仕入</TableHead>
            <TableHead className="text-right">仕入税額</TableHead>
            <TableHead className="text-right">差引税額</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                読み込み中...
              </TableCell>
            </TableRow>
          ) : !data || data.tax_rates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                データがありません
              </TableCell>
            </TableRow>
          ) : (
            <>
              {data.tax_rates.map((row) => (
                <TableRow key={row.tax_code}>
                  <TableCell className="font-medium">{TAX_CODE_LABELS[row.tax_code] || row.tax_code}</TableCell>
                  <TableCell>{row.rate}%</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(row.taxable_sales)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(row.tax_on_sales)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(row.taxable_purchases)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(row.tax_on_purchases)}</TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    <span className={row.net_tax >= 0 ? '' : 'text-red-600'}>
                      {formatAmount(row.net_tax)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold">
                <TableCell colSpan={2}>合計</TableCell>
                <TableCell className="text-right font-mono">{formatAmount(data.total.taxable_sales)}</TableCell>
                <TableCell className="text-right font-mono">{formatAmount(data.total.total_tax_on_sales)}</TableCell>
                <TableCell className="text-right font-mono">{formatAmount(data.total.taxable_purchases)}</TableCell>
                <TableCell className="text-right font-mono">{formatAmount(data.total.total_tax_on_purchases)}</TableCell>
                <TableCell className="text-right font-mono">
                  <span className={data.total.net_tax_payable >= 0 ? '' : 'text-red-600'}>
                    {formatAmount(data.total.net_tax_payable)}
                  </span>
                </TableCell>
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
