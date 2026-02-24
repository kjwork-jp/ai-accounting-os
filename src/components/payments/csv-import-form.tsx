'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface CsvImportFormProps {
  onImportComplete?: () => void;
}

export function CsvImportForm({ onImportComplete }: CsvImportFormProps) {
  const [paymentType, setPaymentType] = useState<'bank' | 'credit_card'>('bank');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    total_rows: number;
    parse_errors: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('CSVファイルを選択してください');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('payment_type', paymentType);

      const res = await fetch('/api/v1/payments/import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message || '取込に失敗しました');
        return;
      }

      setResult(json.data);
      toast.success(`${json.data.imported} 件の明細を取り込みました`);
      onImportComplete?.();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">明細CSV取込</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>取込種別</Label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment_type"
                value="bank"
                checked={paymentType === 'bank'}
                onChange={() => setPaymentType('bank')}
              />
              <span className="text-sm">銀行明細</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment_type"
                value="credit_card"
                checked={paymentType === 'credit_card'}
                onChange={() => setPaymentType('credit_card')}
              />
              <span className="text-sm">クレカ明細</span>
            </label>
          </div>
        </div>

        <div>
          <Label htmlFor="csv-file">CSVファイル</Label>
          <input
            id="csv-file"
            ref={fileRef}
            type="file"
            accept=".csv"
            className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {paymentType === 'bank'
              ? '全銀協フォーマット、主要銀行のCSV形式に対応しています'
              : 'クレジットカード利用明細のCSV形式に対応しています'}
          </p>
        </div>

        <Button type="submit" disabled={loading}>
          {loading ? '取込中...' : '取込実行'}
        </Button>
      </form>

      {result && (
        <div className="mt-4 p-4 bg-muted rounded-md text-sm space-y-1">
          <p>取込結果: <strong>{result.imported}</strong> 件成功 / {result.skipped} 件スキップ（重複） / 全{result.total_rows} 行</p>
          {result.parse_errors.length > 0 && (
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">解析エラー ({result.parse_errors.length} 件)</summary>
              <ul className="mt-1 list-disc list-inside">
                {result.parse_errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
