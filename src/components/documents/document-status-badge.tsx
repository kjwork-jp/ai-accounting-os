'use client';

import { Badge } from '@/components/ui/badge';
import type { DocumentStatus } from '@/types/database';

const STATUS_CONFIG: Record<DocumentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  uploaded: { label: 'アップロード済', variant: 'secondary' },
  queued: { label: 'キュー待ち', variant: 'outline' },
  processing: { label: '処理中', variant: 'default' },
  extracted: { label: '抽出完了', variant: 'default' },
  verified: { label: '検証済', variant: 'default' },
  error: { label: 'エラー', variant: 'destructive' },
};

interface DocumentStatusBadgeProps {
  status: DocumentStatus;
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'secondary' as const };

  return (
    <Badge variant={config.variant} className={
      status === 'processing' ? 'animate-pulse' :
      status === 'extracted' || status === 'verified' ? 'bg-green-600 hover:bg-green-700' :
      ''
    }>
      {config.label}
    </Badge>
  );
}
