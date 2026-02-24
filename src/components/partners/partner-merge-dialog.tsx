'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Partner } from '@/types/database';

interface PartnerMergeDialogProps {
  targetPartner: Partner;
  onComplete?: () => void;
  onCancel?: () => void;
}

interface DuplicateCandidate {
  partner_id: string;
  partner_name: string;
  match_partner_id: string;
  match_partner_name: string;
  similarity: number;
}

export function PartnerMergeDialog({ targetPartner, onComplete, onCancel }: PartnerMergeDialogProps) {
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchDuplicates = async () => {
      try {
        const res = await fetch('/api/v1/partners/duplicates?threshold=0.6');
        if (res.ok) {
          const json = await res.json();
          // Filter to candidates related to the target partner
          const related = (json.data as DuplicateCandidate[]).filter(
            (d) => d.partner_id === targetPartner.id || d.match_partner_id === targetPartner.id
          );
          setDuplicates(related);
        }
      } finally {
        setFetching(false);
      }
    };
    fetchDuplicates();
  }, [targetPartner.id]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selectedIds.size === 0) {
      toast.error('統合する取引先を選択してください');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/partners/${targetPartner.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_from_ids: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || '統合に失敗しました');
        return;
      }
      toast.success(`${json.data.merged_count} 件の取引先を統合しました`);
      onComplete?.();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // Get unique candidate partner IDs (not the target)
  const candidatePartners = duplicates.reduce<{ id: string; name: string; similarity: number }[]>((acc, d) => {
    const otherId = d.partner_id === targetPartner.id ? d.match_partner_id : d.partner_id;
    const otherName = d.partner_id === targetPartner.id ? d.match_partner_name : d.partner_name;
    if (!acc.some((a) => a.id === otherId)) {
      acc.push({ id: otherId, name: otherName, similarity: d.similarity });
    }
    return acc;
  }, []);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-2">取引先の統合</h3>
      <p className="text-sm text-muted-foreground mb-4">
        「{targetPartner.name}」に統合する取引先を選択してください。
        統合元の取引先に関連する仕訳データは統合先に引き継がれます。
      </p>

      {fetching ? (
        <p className="text-sm text-muted-foreground py-4">類似取引先を検索中...</p>
      ) : candidatePartners.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">類似する取引先が見つかりませんでした</p>
      ) : (
        <div className="space-y-2 mb-4">
          {candidatePartners.map((candidate) => (
            <label
              key={candidate.id}
              className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(candidate.id)}
                onChange={() => toggleSelection(candidate.id)}
                className="rounded"
              />
              <span className="flex-1">{candidate.name}</span>
              <Badge variant="outline">類似度: {Math.round(candidate.similarity * 100)}%</Badge>
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
        )}
        <Button
          onClick={handleMerge}
          disabled={loading || selectedIds.size === 0}
          variant="destructive"
        >
          {loading ? '統合中...' : `${selectedIds.size} 件を統合`}
        </Button>
      </div>
    </Card>
  );
}
