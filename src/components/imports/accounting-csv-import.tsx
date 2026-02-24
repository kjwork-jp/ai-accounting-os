'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';

type Template = 'yayoi' | 'freee' | 'moneyforward' | 'custom';
type Step = 'select' | 'preview' | 'mapping' | 'result';

const TEMPLATE_LABELS: Record<Template, string> = {
  yayoi: '弥生会計',
  freee: 'freee',
  moneyforward: 'Money Forward',
  custom: 'カスタム（手動マッピング）',
};

const MAPPING_FIELDS = [
  { key: 'date', label: '日付', required: true },
  { key: 'description', label: '摘要', required: true },
  { key: 'debit_account', label: '借方科目', required: true },
  { key: 'debit_amount', label: '借方金額', required: true },
  { key: 'credit_account', label: '貸方科目', required: true },
  { key: 'credit_amount', label: '貸方金額', required: true },
  { key: 'tax_code', label: '税区分', required: false },
] as const;

export function AccountingCsvImport() {
  const [step, setStep] = useState<Step>('select');
  const [template, setTemplate] = useState<Template>('yayoi');
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({
    date: 0, description: 1, debit_account: 2, debit_amount: 3,
    credit_account: 4, credit_amount: 5, tax_code: -1,
  });
  const [importResult, setImportResult] = useState<{
    imported: number; failed: number; total_rows: number; parse_errors: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePreview = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('CSVファイルを選択してください');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('template', template);
      formData.append('preview', 'true');
      if (template === 'custom') {
        formData.append('column_mapping', JSON.stringify(mapping));
      }

      const res = await fetch('/api/v1/imports/accounting-csv', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message || 'プレビューに失敗しました');
        return;
      }

      setHeaders(json.data.headers);
      setPreview(json.data.preview);
      setTotalRows(json.data.total_rows);

      if (template === 'custom') {
        setStep('mapping');
      } else {
        setStep('preview');
      }
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('template', template);
      formData.append('preview', 'false');
      if (template === 'custom') {
        formData.append('column_mapping', JSON.stringify(mapping));
      }

      const res = await fetch('/api/v1/imports/accounting-csv', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message || 'インポートに失敗しました');
        return;
      }

      setImportResult(json.data);
      setStep('result');
      toast.success(`${json.data.imported} 件の仕訳を取り込みました`);
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (field: string, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: parseInt(value, 10) }));
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Select template and file */}
      {step === 'select' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">会計ソフトCSV取込</h3>
          <div className="space-y-4">
            <div>
              <Label>テンプレート</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(Object.entries(TEMPLATE_LABELS) as [Template, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 p-3 rounded-md border cursor-pointer hover:bg-muted/50">
                    <input
                      type="radio"
                      name="template"
                      value={key}
                      checked={template === key}
                      onChange={() => setTemplate(key)}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="accounting-csv">CSVファイル</Label>
              <input
                id="accounting-csv"
                ref={fileRef}
                type="file"
                accept=".csv"
                className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            <Button onClick={handlePreview} disabled={loading}>
              {loading ? '読み込み中...' : 'プレビュー'}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Custom mapping */}
      {step === 'mapping' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">列マッピング設定</h3>
          <p className="text-sm text-muted-foreground mb-4">
            CSVの各列を仕訳項目にマッピングしてください。ヘッダー: {headers.join(', ')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MAPPING_FIELDS.map((field) => (
              <div key={field.key}>
                <Label className="text-xs">
                  {field.label} {field.required && '*'}
                </Label>
                <select
                  value={mapping[field.key] ?? -1}
                  onChange={(e) => updateMapping(field.key, e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {!field.required && <option value="-1">（なし）</option>}
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      列{i}: {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setStep('select')}>戻る</Button>
            <Button onClick={() => setStep('preview')}>プレビューを確認</Button>
          </div>
        </Card>
      )}

      {/* Step 3: Preview */}
      {(step === 'preview' || step === 'mapping') && preview.length > 0 && step === 'preview' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">プレビュー</h3>
          <p className="text-sm text-muted-foreground mb-4">
            解析結果: {totalRows} 件の仕訳データ（先頭20行を表示）
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h, i) => (
                    <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="text-xs whitespace-nowrap">{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setStep('select')}>戻る</Button>
            <Button onClick={handleImport} disabled={loading}>
              {loading ? 'インポート中...' : `${totalRows} 件をインポート`}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 'result' && importResult && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">インポート完了</h3>
          <div className="space-y-2 text-sm">
            <p>取込成功: <strong>{importResult.imported}</strong> 件</p>
            <p>取込失敗: <strong>{importResult.failed}</strong> 件</p>
            <p>全データ行: <strong>{importResult.total_rows}</strong> 件</p>
            {importResult.parse_errors.length > 0 && (
              <details className="text-muted-foreground">
                <summary className="cursor-pointer">解析エラー ({importResult.parse_errors.length} 件)</summary>
                <ul className="mt-1 list-disc list-inside">
                  {importResult.parse_errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <Button className="mt-4" onClick={() => { setStep('select'); setImportResult(null); }}>
            別のCSVを取り込む
          </Button>
        </Card>
      )}
    </div>
  );
}
