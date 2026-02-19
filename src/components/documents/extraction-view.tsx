'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface ExtractionViewProps {
  extraction: {
    extracted_json: Record<string, unknown>;
    model_provider: string | null;
    model_name: string | null;
    confidence: number | null;
    extracted_at: string | null;
    created_at: string;
  };
}

export function ExtractionView({ extraction }: ExtractionViewProps) {
  const json = extraction.extracted_json;
  const classification = json.classification as {
    document_type?: string;
    confidence?: number;
    method?: string;
    reasoning?: string;
  } | undefined;

  const duplicateSuspects = (json.duplicate_suspects ?? []) as Array<{
    document_id: string;
    file_name: string;
    match_reason: string;
  }>;

  const lineItems = (json.line_items ?? []) as Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
    tax_rate: number | null;
  }>;

  const taxDetails = (json.tax_details ?? []) as Array<{
    rate: number;
    taxable_amount: number;
    tax_amount: number;
  }>;

  const formatCurrency = (val: unknown): string => {
    if (val == null) return '—';
    const num = Number(val);
    if (isNaN(num)) return '—';
    return `¥${num.toLocaleString()}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">抽出結果</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{extraction.model_provider}/{extraction.model_name}</span>
            {extraction.confidence != null && (
              <Badge variant="outline">
                信頼度 {(extraction.confidence * 100).toFixed(0)}%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Classification result */}
        {classification && (
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">分類結果:</span>
              <Badge variant="secondary">
                {classification.document_type}
              </Badge>
              {classification.confidence != null && (
                <span className="text-muted-foreground">
                  ({(classification.confidence * 100).toFixed(0)}% / {classification.method})
                </span>
              )}
            </div>
            {classification.reasoning && (
              <p className="text-muted-foreground text-xs">{classification.reasoning}</p>
            )}
          </div>
        )}

        {/* Duplicate warning */}
        {duplicateSuspects.length > 0 && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 text-yellow-800 font-medium">
              重複の可能性がある証憑 ({duplicateSuspects.length}件)
            </div>
            <ul className="space-y-1 text-yellow-700">
              {duplicateSuspects.map((s) => (
                <li key={s.document_id}>
                  <a href={`/documents/${s.document_id}`} className="underline hover:text-yellow-900">
                    {s.file_name}
                  </a>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {s.match_reason === 'date_amount' ? '日付±3日+金額一致' : s.match_reason}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key extracted fields */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">取引先名</dt>
          <dd>{(json.vendor_name as string) ?? '—'}</dd>
          <dt className="text-muted-foreground">得意先名</dt>
          <dd>{(json.customer_name as string) ?? '—'}</dd>
          <dt className="text-muted-foreground">請求書番号</dt>
          <dd>{(json.invoice_number as string) ?? '—'}</dd>
          <dt className="text-muted-foreground">書類日付</dt>
          <dd>{(json.document_date as string) ?? '—'}</dd>
          <dt className="text-muted-foreground">支払期限</dt>
          <dd>{(json.due_date as string) ?? '—'}</dd>
          <dt className="text-muted-foreground">小計</dt>
          <dd>{formatCurrency(json.subtotal)}</dd>
          <dt className="text-muted-foreground">税額</dt>
          <dd>{formatCurrency(json.tax_amount)}</dd>
          <dt className="text-muted-foreground font-medium">合計金額</dt>
          <dd className="font-medium">{formatCurrency(json.total_amount)}</dd>
        </dl>

        {/* Tax details */}
        {taxDetails.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">税区分明細</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>税率</TableHead>
                    <TableHead className="text-right">課税対象額</TableHead>
                    <TableHead className="text-right">税額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxDetails.map((td, i) => (
                    <TableRow key={i}>
                      <TableCell>{td.rate}%</TableCell>
                      <TableCell className="text-right">¥{td.taxable_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">¥{td.tax_amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Line items */}
        {lineItems.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">明細行</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>品名</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">単価</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.description || '—'}</TableCell>
                      <TableCell className="text-right">{item.quantity ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {item.unit_price != null ? `¥${item.unit_price.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">¥{item.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Extracted at timestamp */}
        <div className="text-xs text-muted-foreground pt-2">
          抽出日時: {new Date(extraction.extracted_at ?? extraction.created_at).toLocaleString('ja-JP')}
        </div>
      </CardContent>
    </Card>
  );
}
