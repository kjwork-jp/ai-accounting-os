'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';

interface ReconciliationSuggestion {
  reconciliation_id: string;
  payment_id: string;
  target_type: string;
  target_id: string;
  confidence: number;
  match_reasons: string[];
}

interface SuggestSummary {
  total_unreconciled_payments: number;
  total_unreconciled_entries: number;
  matched: number;
  unmatched_payments: number;
}

export function ReconciliationList() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestion[]>([]);
  const [summary, setSummary] = useState<SuggestSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  const handleSuggest = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('期間を指定してください');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/reconciliations/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || '突合提案の生成に失敗しました');
        return;
      }
      setSuggestions(json.data.suggestions);
      setSummary(json.data.summary);
      toast.success(`${json.data.suggestions.length} 件の突合候補が見つかりました`);
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (suggestion: ReconciliationSuggestion) => {
    setConfirming((prev) => new Set(prev).add(suggestion.payment_id));
    try {
      const res = await fetch(`/api/v1/reconciliations/${suggestion.reconciliation_id}/confirm`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || '確定に失敗しました');
        return;
      }
      toast.success('突合を確定しました');
      setSuggestions((prev) => prev.filter((s) => s.payment_id !== suggestion.payment_id));
    } catch {
      toast.error('確定に失敗しました');
    } finally {
      setConfirming((prev) => {
        const next = new Set(prev);
        next.delete(suggestion.payment_id);
        return next;
      });
    }
  };

  const formatAmount = (confidence: number) =>
    `${Math.round(confidence * 100)}%`;

  return (
    <Card>
      <div className="p-4 border-b">
        <h3 className="font-semibold mb-3">明細-仕訳突合</h3>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
          <span className="text-muted-foreground">〜</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
          <Button onClick={handleSuggest} disabled={loading || !dateFrom || !dateTo}>
            {loading ? '検索中...' : '突合候補を検索'}
          </Button>
        </div>
      </div>

      {summary && (
        <div className="px-4 py-3 bg-muted/50 text-sm flex gap-6">
          <span>未突合明細: <strong>{summary.total_unreconciled_payments}</strong></span>
          <span>未突合仕訳: <strong>{summary.total_unreconciled_entries}</strong></span>
          <span>マッチ: <strong>{summary.matched}</strong></span>
          <span>未マッチ: <strong>{summary.unmatched_payments}</strong></span>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>明細ID</TableHead>
            <TableHead>仕訳ID</TableHead>
            <TableHead>信頼度</TableHead>
            <TableHead>マッチ理由</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suggestions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                {summary ? '突合候補がありません' : '期間を指定して突合候補を検索してください'}
              </TableCell>
            </TableRow>
          ) : (
            suggestions.map((s) => (
              <TableRow key={s.payment_id}>
                <TableCell className="font-mono text-xs">{s.payment_id.slice(0, 8)}...</TableCell>
                <TableCell className="font-mono text-xs">{s.target_id.slice(0, 8)}...</TableCell>
                <TableCell>
                  <Badge variant={s.confidence >= 0.8 ? 'default' : s.confidence >= 0.6 ? 'secondary' : 'outline'}>
                    {formatAmount(s.confidence)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.match_reasons.join(', ')}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={confirming.has(s.payment_id)}
                    onClick={() => handleConfirm(s)}
                  >
                    {confirming.has(s.payment_id) ? '処理中...' : '確定'}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
