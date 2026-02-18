'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_STATUSES, DOCUMENT_TYPE_CODES } from '@/lib/validators/documents';

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'アップロード済',
  queued: 'キュー待ち',
  processing: '処理中',
  extracted: '抽出完了',
  verified: '検証済',
  error: 'エラー',
};

const TYPE_LABELS: Record<string, string> = {
  invoice: '請求書',
  receipt: '領収書',
  quotation: '見積書',
  contract: '契約書',
  bank_statement: '銀行明細',
  credit_card: 'クレカ明細',
  other: 'その他',
};

export interface DocumentFilters {
  status?: string;
  document_type?: string;
  q?: string;
}

interface DocumentFiltersProps {
  filters: DocumentFilters;
  onChange: (filters: DocumentFilters) => void;
}

export function DocumentFiltersPanel({ filters, onChange }: DocumentFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="ファイル名で検索..."
        value={filters.q ?? ''}
        onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
        className="w-[220px]"
      />

      <Select
        value={filters.status ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, status: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="ステータス" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          {DOCUMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s] ?? s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.document_type ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, document_type: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="種別" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          {DOCUMENT_TYPE_CODES.map((t) => (
            <SelectItem key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
