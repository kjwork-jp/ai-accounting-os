'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface JournalExportButtonProps {
  dateFrom: string;
  dateTo: string;
}

export function JournalExportButton({ dateFrom, dateTo }: JournalExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: 'standard' | 'yayoi') => {
    if (!dateFrom || !dateTo) {
      toast.error('期間を指定してください');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, format });
      const res = await fetch(`/api/v1/journals/export?${params}`);

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error?.message || 'エクスポートに失敗しました');
        return;
      }

      // Download CSV file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? `journal_export_${dateFrom}_${dateTo}.csv`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('CSVをダウンロードしました');
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('standard')}
        disabled={loading || !dateFrom || !dateTo}
      >
        {loading ? 'エクスポート中...' : 'CSV出力'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport('yayoi')}
        disabled={loading || !dateFrom || !dateTo}
      >
        弥生形式CSV
      </Button>
    </div>
  );
}
