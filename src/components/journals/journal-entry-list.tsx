'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { JournalEntryStatus } from '@/types/database';

interface JournalLine {
  id: string;
  line_no: number;
  account_code: string;
  account_name: string | null;
  debit: number;
  credit: number;
  tax_code: string | null;
  memo: string | null;
}

interface JournalEntry {
  id: string;
  entry_date: string;
  description: string | null;
  source_type: string;
  status: JournalEntryStatus;
  total_amount: number;
  journal_lines: JournalLine[];
}

interface PaginationInfo {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  confirmed: '確定',
  reversed: '取消',
};

const SOURCE_LABELS: Record<string, string> = {
  document: '証憑',
  order: '受発注',
  invoice: '請求書',
  manual: '手動',
};

export function JournalEntryList() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (keyword) params.set('keyword', keyword);
    if (status) params.set('status', status);

    try {
      const res = await fetch(`/api/v1/journals/entries?${params}`);
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data);
        setPagination(json.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, keyword, status]);

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);

  return (
    <Card>
      <div className="p-4 border-b">
        <div className="flex flex-wrap gap-3">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
            placeholder="開始日"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
            placeholder="終了日"
          />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="摘要で検索..."
            className="w-48"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">全ステータス</option>
            <option value="draft">下書き</option>
            <option value="confirmed">確定</option>
            <option value="reversed">取消</option>
          </select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>日付</TableHead>
            <TableHead>摘要</TableHead>
            <TableHead>ソース</TableHead>
            <TableHead className="text-right">金額</TableHead>
            <TableHead>ステータス</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                読み込み中...
              </TableCell>
            </TableRow>
          ) : entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                仕訳データがありません
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <>
                <TableRow
                  key={entry.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <TableCell className="text-muted-foreground">
                    {expandedId === entry.id ? '▼' : '▶'}
                  </TableCell>
                  <TableCell>{entry.entry_date}</TableCell>
                  <TableCell>{entry.description || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{SOURCE_LABELS[entry.source_type] || entry.source_type}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(entry.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={entry.status === 'confirmed' ? 'default' : 'secondary'}>
                      {STATUS_LABELS[entry.status] || entry.status}
                    </Badge>
                  </TableCell>
                </TableRow>
                {expandedId === entry.id && entry.journal_lines?.length > 0 && (
                  <TableRow key={`${entry.id}-lines`}>
                    <TableCell colSpan={6} className="bg-muted/30 p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>No</TableHead>
                            <TableHead>勘定科目</TableHead>
                            <TableHead className="text-right">借方</TableHead>
                            <TableHead className="text-right">貸方</TableHead>
                            <TableHead>税区分</TableHead>
                            <TableHead>メモ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.journal_lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>{line.line_no}</TableCell>
                              <TableCell>{line.account_name || line.account_code}</TableCell>
                              <TableCell className="text-right font-mono">
                                {line.debit > 0 ? formatAmount(line.debit) : ''}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {line.credit > 0 ? formatAmount(line.credit) : ''}
                              </TableCell>
                              <TableCell>{line.tax_code || '—'}</TableCell>
                              <TableCell className="text-muted-foreground">{line.memo || ''}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))
          )}
        </TableBody>
      </Table>

      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {pagination.total} 件中 {((pagination.page - 1) * pagination.per_page) + 1}–
            {Math.min(pagination.page * pagination.per_page, pagination.total)} 件表示
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchEntries(pagination.page - 1)}>
              前へ
            </Button>
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => fetchEntries(pagination.page + 1)}>
              次へ
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
