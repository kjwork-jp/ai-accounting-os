'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JournalConfirmDialog } from './journal-confirm-dialog';

interface JournalDraft {
  id: string;
  document_id: string | null;
  status: string;
  candidates_json: unknown;
  confidence: number | null;
  ai_reason: string | null;
  created_at: string;
  documents?: {
    id: string;
    file_name: string;
    document_type: string;
    amount: number | null;
    document_date: string | null;
  } | null;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

const STATUS_LABELS: Record<string, string> = {
  suggested: '自動確定候補',
  needs_review: '要確認',
  confirmed: '確定済',
  error: 'エラー',
};

const STATUS_COLORS: Record<string, string> = {
  suggested: 'bg-green-100 text-green-800',
  needs_review: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  error: 'bg-red-100 text-red-800',
};

export function JournalDraftList() {
  const [drafts, setDrafts] = useState<JournalDraft[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<JournalDraft | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchDrafts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '20' });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/v1/journals/drafts?${params}`);
      const json = await res.json();
      setDrafts(json.data ?? []);
      setPagination(json.pagination ?? { page: 1, per_page: 20, total: 0, total_pages: 0 });
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // Polling for pending drafts (10s interval)
  useEffect(() => {
    if (statusFilter === 'confirmed') return;
    const interval = setInterval(() => fetchDrafts(pagination.page), 10_000);
    return () => clearInterval(interval);
  }, [fetchDrafts, statusFilter, pagination.page]);

  const openConfirmDialog = (draft: JournalDraft) => {
    setSelectedDraft(draft);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">ステータス:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="needs_review">要確認</SelectItem>
              <SelectItem value="suggested">自動確定候補</SelectItem>
              <SelectItem value="confirmed">確定済</SelectItem>
              <SelectItem value="error">エラー</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          全{pagination.total}件
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>証憑</TableHead>
              <TableHead>種別</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>信頼度</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : drafts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  仕訳候補がありません
                </TableCell>
              </TableRow>
            ) : (
              drafts.map(draft => (
                <TableRow key={draft.id}>
                  <TableCell className="font-medium">
                    {draft.documents?.file_name ?? '-'}
                  </TableCell>
                  <TableCell>
                    {draft.documents?.document_type ?? '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {draft.documents?.amount != null
                      ? `¥${draft.documents.amount.toLocaleString()}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {draft.confidence != null ? (
                      <span className={`text-sm font-medium ${
                        draft.confidence >= 0.9 ? 'text-green-700' :
                        draft.confidence >= 0.7 ? 'text-yellow-700' :
                        'text-red-700'
                      }`}>
                        {(draft.confidence * 100).toFixed(0)}%
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[draft.status] ?? ''}>
                      {STATUS_LABELS[draft.status] ?? draft.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(draft.created_at).toLocaleString('ja-JP')}
                  </TableCell>
                  <TableCell>
                    {(draft.status === 'suggested' || draft.status === 'needs_review') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openConfirmDialog(draft)}
                      >
                        確認
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchDrafts(pagination.page - 1)}
          >
            前へ
          </Button>
          <span className="text-sm leading-8">
            {pagination.page} / {pagination.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.total_pages}
            onClick={() => fetchDrafts(pagination.page + 1)}
          >
            次へ
          </Button>
        </div>
      )}

      {/* Confirm dialog */}
      {selectedDraft && (
        <JournalConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          draftId={selectedDraft.id}
          candidates={
            Array.isArray(selectedDraft.candidates_json)
              ? selectedDraft.candidates_json
              : []
          }
          documentName={selectedDraft.documents?.file_name}
          onConfirmed={() => fetchDrafts(pagination.page)}
        />
      )}
    </div>
  );
}
