'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccountSelect } from './account-select';

interface CandidateLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  tax_code: string | null;
  memo: string;
}

interface Candidate {
  lines: CandidateLine[];
  description: string;
  reasoning: string;
  confidence: number;
}

interface JournalConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
  candidates: Candidate[];
  documentName?: string;
  onConfirmed: () => void;
}

function confidenceBadge(confidence: number) {
  if (confidence >= 0.9) return <Badge className="bg-green-100 text-green-800">高信頼度 {(confidence * 100).toFixed(0)}%</Badge>;
  if (confidence >= 0.7) return <Badge className="bg-yellow-100 text-yellow-800">中信頼度 {(confidence * 100).toFixed(0)}%</Badge>;
  return <Badge className="bg-red-100 text-red-800">低信頼度 {(confidence * 100).toFixed(0)}%</Badge>;
}

export function JournalConfirmDialog({
  open,
  onOpenChange,
  draftId,
  candidates,
  documentName,
  onConfirmed,
}: JournalConfirmDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editLines, setEditLines] = useState<CandidateLine[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = candidates[selectedIndex];

  const startEditing = useCallback(() => {
    setEditLines(selected.lines.map(l => ({ ...l })));
    setEditDescription(selected.description);
    setIsEditing(true);
  }, [selected]);

  const currentLines = isEditing ? editLines : selected?.lines ?? [];
  const totalDebit = currentLines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = currentLines.reduce((sum, l) => sum + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const updateLine = (idx: number, field: keyof CandidateLine, value: unknown) => {
    setEditLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addLine = () => {
    setEditLines(prev => [
      ...prev,
      { account_code: '', account_name: '', debit: 0, credit: 0, tax_code: null, memo: '' },
    ]);
  };

  const removeLine = (idx: number) => {
    setEditLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { selectedIndex };
      if (isEditing) {
        body.overrideLines = editLines;
        body.overrideDescription = editDescription;
        if (overrideReason) body.overrideReason = overrideReason;
      }

      const idempotencyKey = `confirm:${draftId}:${selectedIndex}:${Date.now()}`;
      const res = await fetch(`/api/v1/journals/drafts/${draftId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message ?? `確定に失敗しました (${res.status})`);
      }

      onConfirmed();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '確定に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (!selected) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>仕訳確認・確定</DialogTitle>
          {documentName && (
            <p className="text-sm text-muted-foreground">{documentName}</p>
          )}
        </DialogHeader>

        {/* Candidate tabs */}
        <div className="flex gap-2 mb-4">
          {candidates.map((cand, i) => (
            <Button
              key={i}
              variant={selectedIndex === i ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedIndex(i);
                setIsEditing(false);
              }}
            >
              候補{i + 1} {confidenceBadge(cand.confidence)}
            </Button>
          ))}
        </div>

        {/* AI reasoning */}
        <div className="bg-muted p-3 rounded-md mb-4">
          <p className="text-sm font-medium mb-1">AI推定理由</p>
          <p className="text-sm text-muted-foreground">{selected.reasoning}</p>
        </div>

        {/* Journal lines table */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">勘定科目</TableHead>
                <TableHead className="w-[120px] text-right">借方</TableHead>
                <TableHead className="w-[120px] text-right">貸方</TableHead>
                <TableHead className="w-[100px]">税区分</TableHead>
                <TableHead>摘要</TableHead>
                {isEditing && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentLines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    {isEditing ? (
                      <AccountSelect
                        value={line.account_code}
                        onChange={(code, name) => {
                          updateLine(idx, 'account_code', code);
                          updateLine(idx, 'account_name', name);
                        }}
                      />
                    ) : (
                      <span className="text-sm">{line.account_code} {line.account_name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={line.debit}
                        onChange={e => updateLine(idx, 'debit', Number(e.target.value) || 0)}
                        className="text-right h-8"
                      />
                    ) : (
                      line.debit > 0 && `¥${line.debit.toLocaleString()}`
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={line.credit}
                        onChange={e => updateLine(idx, 'credit', Number(e.target.value) || 0)}
                        className="text-right h-8"
                      />
                    ) : (
                      line.credit > 0 && `¥${line.credit.toLocaleString()}`
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select
                        value={line.tax_code ?? 'none'}
                        onValueChange={v => updateLine(idx, 'tax_code', v === 'none' ? null : v)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TAX10">10%</SelectItem>
                          <SelectItem value="TAX8">8%</SelectItem>
                          <SelectItem value="NONTAX">非課税</SelectItem>
                          <SelectItem value="EXEMPT">免税</SelectItem>
                          <SelectItem value="none">なし</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">{line.tax_code ?? '-'}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={line.memo}
                        onChange={e => updateLine(idx, 'memo', e.target.value)}
                        className="h-8"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">{line.memo || '-'}</span>
                    )}
                  </TableCell>
                  {isEditing && (
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)}>
                        ×
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="font-medium">
                <TableCell>合計</TableCell>
                <TableCell className="text-right">¥{totalDebit.toLocaleString()}</TableCell>
                <TableCell className="text-right">¥{totalCredit.toLocaleString()}</TableCell>
                <TableCell colSpan={isEditing ? 3 : 2}>
                  {!isBalanced && (
                    <span className="text-red-600 text-sm">貸借不一致</span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {isEditing && (
          <div className="space-y-3">
            <Button variant="outline" size="sm" onClick={addLine}>
              + 行を追加
            </Button>
            <div>
              <Label>摘要</Label>
              <Input
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>修正理由</Label>
              <Input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="修正理由を入力（任意）"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!isEditing ? (
            <>
              <Button variant="outline" onClick={startEditing}>
                修正して確定
              </Button>
              <Button onClick={handleConfirm} disabled={submitting}>
                {submitting ? '確定中...' : 'この候補で確定'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                修正を取消
              </Button>
              <Button onClick={handleConfirm} disabled={submitting || !isBalanced}>
                {submitting ? '確定中...' : '修正内容で確定'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
