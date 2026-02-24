'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { DOCUMENT_TYPE_CODES } from '@/lib/validators/documents';

/**
 * 電帳法6キー検索パネル (CMN-010)
 * 6 keys: 取引年月日, 取引金額, 取引先名, 書類種別, 登録番号, 受領日(created_at)
 */

export interface DocumentSearchFilters {
  date_from?: string;
  date_to?: string;
  amount_min?: string;
  amount_max?: string;
  partner_name?: string;
  document_type?: string;
  registration_number?: string;
  q?: string;
}

interface DocumentSearchPanelProps {
  filters: DocumentSearchFilters;
  onChange: (filters: DocumentSearchFilters) => void;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: '請求書',
  receipt: '領収書',
  quotation: '見積書',
  contract: '契約書',
  bank_statement: '銀行明細',
  credit_card: 'クレカ明細',
  other: 'その他',
};

export function DocumentSearchPanel({ filters, onChange }: DocumentSearchPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const updateFilter = (key: keyof DocumentSearchFilters, value: string) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  const clearFilters = () => {
    onChange({});
  };

  const hasActiveFilters = Object.values(filters).some((v) => v);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">
          電帳法6キー検索
        </h3>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              クリア
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? '閉じる' : '詳細検索'}
          </Button>
        </div>
      </div>

      {/* Basic search row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">取引年月日（開始）</Label>
          <Input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => updateFilter('date_from', e.target.value)}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">取引年月日（終了）</Label>
          <Input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => updateFilter('date_to', e.target.value)}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">取引金額（下限）</Label>
          <Input
            type="number"
            value={filters.amount_min || ''}
            onChange={(e) => updateFilter('amount_min', e.target.value)}
            placeholder="0"
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">取引金額（上限）</Label>
          <Input
            type="number"
            value={filters.amount_max || ''}
            onChange={(e) => updateFilter('amount_max', e.target.value)}
            placeholder="999,999,999"
            className="h-9"
          />
        </div>
      </div>

      {/* Expanded search fields */}
      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t">
          <div>
            <Label className="text-xs">取引先名</Label>
            <Input
              value={filters.partner_name || ''}
              onChange={(e) => updateFilter('partner_name', e.target.value)}
              placeholder="部分一致検索"
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">書類種別</Label>
            <select
              value={filters.document_type || ''}
              onChange={(e) => updateFilter('document_type', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">全種別</option>
              {DOCUMENT_TYPE_CODES.map((code) => (
                <option key={code} value={code}>
                  {DOC_TYPE_LABELS[code] || code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">登録番号</Label>
            <Input
              value={filters.registration_number || ''}
              onChange={(e) => updateFilter('registration_number', e.target.value)}
              placeholder="T1234567890123"
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">ファイル名検索</Label>
            <Input
              value={filters.q || ''}
              onChange={(e) => updateFilter('q', e.target.value)}
              placeholder="キーワード"
              className="h-9"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
