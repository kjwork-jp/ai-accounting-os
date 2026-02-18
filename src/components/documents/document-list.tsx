'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DocumentStatusBadge } from './document-status-badge';
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

interface DocumentRow {
  id: string;
  file_name: string;
  document_type: DocumentTypeCode;
  document_date: string | null;
  amount: number | null;
  status: DocumentStatus;
  created_at: string;
}

interface DocumentListMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

interface DocumentListProps {
  filters?: { status?: string; document_type?: string; q?: string };
}

export function DocumentList({ filters }: DocumentListProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [meta, setMeta] = useState<DocumentListMeta>({ total: 0, page: 1, per_page: 20, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDocuments = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (filters?.status) params.set('status', filters.status);
    if (filters?.document_type) params.set('document_type', filters.document_type);
    if (filters?.q) params.set('q', filters.q);

    const res = await fetch(`/api/v1/documents?${params.toString()}`);
    if (!res.ok) return;

    const body = await res.json();
    setDocuments(body.data ?? []);
    setMeta(body.meta ?? { total: 0, page: 1, per_page: 20, total_pages: 0 });
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Poll for status changes when any document is queued/processing
  useEffect(() => {
    const hasActive = documents.some(
      (d) => d.status === 'queued' || d.status === 'processing'
    );

    if (hasActive) {
      pollIntervalRef.current = setInterval(fetchDocuments, 5000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [documents, fetchDocuments]);

  const handleRetry = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/v1/documents/${docId}/enqueue-parse`, {
      method: 'POST',
    });
    if (res.ok) {
      fetchDocuments();
    }
  };

  const formatAmount = (amount: number | null) => {
    if (amount == null) return '—';
    return `¥${amount.toLocaleString()}`;
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return date;
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ファイル名</TableHead>
            <TableHead>種別</TableHead>
            <TableHead>日付</TableHead>
            <TableHead className="text-right">金額</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>アップロード日</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                ドキュメントがありません
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow
                key={doc.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/documents/${doc.id}`)}
              >
                <TableCell className="font-medium max-w-[200px] truncate">
                  {doc.file_name}
                </TableCell>
                <TableCell>{TYPE_LABELS[doc.document_type] ?? doc.document_type}</TableCell>
                <TableCell>{formatDate(doc.document_date)}</TableCell>
                <TableCell className="text-right">{formatAmount(doc.amount)}</TableCell>
                <TableCell>
                  <DocumentStatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell>
                  {doc.status === 'error' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleRetry(doc.id, e)}
                      title="再処理"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {meta.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            全{meta.total}件中 {(meta.page - 1) * meta.per_page + 1}〜
            {Math.min(meta.page * meta.per_page, meta.total)}件
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              前へ
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              次へ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
