'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentStatusBadge } from './document-status-badge';
import { DocumentPreview } from './document-preview';
import { ExtractionView } from './extraction-view';
import { toast } from 'sonner';
import type { DocumentStatus, DocumentTypeCode } from '@/types/database';

const TYPE_LABELS: Record<DocumentTypeCode, string> = {
  invoice: '請求書',
  receipt: '領収書',
  quotation: '見積書',
  contract: '契約書',
  bank_statement: '銀行明細',
  credit_card: 'クレカ明細',
  other: 'その他',
};

interface DocumentData {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  document_type: DocumentTypeCode;
  status: DocumentStatus;
  document_date: string | null;
  amount: number | null;
  tax_amount: number | null;
  registration_number: string | null;
  created_at: string;
  updated_at: string;
}

interface ExtractionData {
  id: string;
  extracted_json: Record<string, unknown>;
  model_provider: string | null;
  model_name: string | null;
  confidence: number | null;
  extracted_at: string | null;
  created_at: string;
}

interface DocumentDetailProps {
  document: DocumentData;
  extraction: ExtractionData | null;
  signedUrl: string | null;
  canRetry: boolean;
}

export function DocumentDetail({
  document: initialDoc,
  extraction,
  signedUrl,
  canRetry,
}: DocumentDetailProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [status, setStatus] = useState<DocumentStatus>(initialDoc.status);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/v1/documents/${initialDoc.id}/retry`, {
        method: 'POST',
      });
      if (res.ok) {
        setStatus('queued');
        toast.success('再処理をキューに投入しました');
        setTimeout(() => router.refresh(), 2000);
      } else {
        const body = await res.json();
        toast.error(body.error?.message ?? 'リトライに失敗しました');
      }
    } catch {
      toast.error('リトライに失敗しました');
    } finally {
      setRetrying(false);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/documents')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          戻る
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{initialDoc.file_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <DocumentStatusBadge status={status} />
            <span className="text-sm text-muted-foreground">
              {TYPE_LABELS[initialDoc.document_type]}
            </span>
          </div>
        </div>
        {canRetry && (status === 'error' || status === 'queued') && (
          <Button onClick={handleRetry} disabled={retrying} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
            {status === 'queued' ? '再キュー' : '再処理'}
          </Button>
        )}
      </div>

      {/* Error banner */}
      {status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
          OCR処理中にエラーが発生しました。再処理ボタンから再実行できます。
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">プレビュー</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentPreview
              signedUrl={signedUrl}
              mimeType={initialDoc.mime_type}
              fileName={initialDoc.file_name}
            />
          </CardContent>
        </Card>

        {/* Right: Metadata + Extraction */}
        <div className="space-y-6">
          {/* Document metadata card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">基本情報</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">ファイル名</dt>
                <dd className="truncate">{initialDoc.file_name}</dd>
                <dt className="text-muted-foreground">種別</dt>
                <dd>{TYPE_LABELS[initialDoc.document_type]}</dd>
                <dt className="text-muted-foreground">証憑日付</dt>
                <dd>{initialDoc.document_date ?? '—'}</dd>
                <dt className="text-muted-foreground">金額</dt>
                <dd>{initialDoc.amount != null ? `¥${initialDoc.amount.toLocaleString()}` : '—'}</dd>
                <dt className="text-muted-foreground">税額</dt>
                <dd>{initialDoc.tax_amount != null ? `¥${initialDoc.tax_amount.toLocaleString()}` : '—'}</dd>
                <dt className="text-muted-foreground">登録番号</dt>
                <dd>{initialDoc.registration_number ?? '—'}</dd>
                <dt className="text-muted-foreground">ファイルサイズ</dt>
                <dd>{formatSize(initialDoc.file_size)}</dd>
                <dt className="text-muted-foreground">アップロード日時</dt>
                <dd>{new Date(initialDoc.created_at).toLocaleString('ja-JP')}</dd>
              </dl>
            </CardContent>
          </Card>

          {/* Extraction view */}
          {extraction && <ExtractionView extraction={extraction} />}
        </div>
      </div>
    </div>
  );
}
