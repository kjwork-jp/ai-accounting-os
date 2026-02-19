'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { JournalConfirmDialog } from './journal-confirm-dialog';

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
  status: string;
  total_amount: number;
  tax_amount: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
  journal_lines: JournalLine[];
}

interface JournalDraft {
  id: string;
  status: string;
  candidates_json: unknown;
  confidence: number | null;
  ai_reason: string | null;
  confirmed_at: string | null;
}

interface DocumentJournalSectionProps {
  draft: JournalDraft;
  journalEntry: JournalEntry | null;
  canConfirm: boolean;
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

export function DocumentJournalSection({
  draft,
  journalEntry,
  canConfirm,
}: DocumentJournalSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const candidates = Array.isArray(draft.candidates_json)
    ? draft.candidates_json
    : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">AI仕訳</CardTitle>
          <div className="flex items-center gap-2">
            {draft.confidence != null && (
              <span className={`text-sm font-medium ${
                draft.confidence >= 0.9 ? 'text-green-700' :
                draft.confidence >= 0.7 ? 'text-yellow-700' :
                'text-red-700'
              }`}>
                信頼度 {(draft.confidence * 100).toFixed(0)}%
              </span>
            )}
            <Badge className={STATUS_COLORS[draft.status] ?? ''}>
              {STATUS_LABELS[draft.status] ?? draft.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI reason */}
        {draft.ai_reason && draft.status !== 'error' && (
          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm text-muted-foreground">{draft.ai_reason}</p>
          </div>
        )}

        {/* Error message */}
        {draft.status === 'error' && draft.ai_reason && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-700">{draft.ai_reason}</p>
          </div>
        )}

        {/* Confirmed journal entry */}
        {journalEntry && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">仕訳日付: </span>
                <span className="font-medium">{journalEntry.entry_date}</span>
              </div>
              <div>
                <span className="text-muted-foreground">摘要: </span>
                <span className="font-medium">{journalEntry.description ?? '-'}</span>
              </div>
            </div>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>勘定科目</TableHead>
                    <TableHead className="text-right">借方</TableHead>
                    <TableHead className="text-right">貸方</TableHead>
                    <TableHead>税区分</TableHead>
                    <TableHead>摘要</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalEntry.journal_lines
                    .sort((a, b) => a.line_no - b.line_no)
                    .map(line => (
                      <TableRow key={line.id}>
                        <TableCell>{line.account_code} {line.account_name}</TableCell>
                        <TableCell className="text-right">
                          {line.debit > 0 && `¥${line.debit.toLocaleString()}`}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.credit > 0 && `¥${line.credit.toLocaleString()}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{line.tax_code ?? '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{line.memo ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
            {journalEntry.confirmed_at && (
              <p className="text-xs text-muted-foreground">
                確定日時: {new Date(journalEntry.confirmed_at).toLocaleString('ja-JP')}
              </p>
            )}
          </div>
        )}

        {/* Unconfirmed — show candidates summary + confirm button */}
        {!journalEntry && candidates.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {candidates.length}件の仕訳候補が生成されています
            </p>
            {canConfirm && (draft.status === 'suggested' || draft.status === 'needs_review') && (
              <Button onClick={() => setDialogOpen(true)}>
                確認・確定
              </Button>
            )}
          </div>
        )}

        {/* Confirm dialog */}
        {dialogOpen && (
          <JournalConfirmDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            draftId={draft.id}
            candidates={candidates}
            onConfirmed={() => window.location.reload()}
          />
        )}
      </CardContent>
    </Card>
  );
}
