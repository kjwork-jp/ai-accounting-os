'use client';

import { FileText, ImageIcon } from 'lucide-react';

interface DocumentPreviewProps {
  previewUrl: string | null;
  mimeType: string | null;
  fileName: string;
}

export function DocumentPreview({ previewUrl, mimeType, fileName }: DocumentPreviewProps) {
  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mb-2" />
        <p className="text-sm">プレビューを表示できません</p>
      </div>
    );
  }

  // PDF: use iframe
  if (mimeType === 'application/pdf') {
    return (
      <iframe
        src={previewUrl}
        className="w-full h-[600px] rounded border"
        title={`Preview of ${fileName}`}
      />
    );
  }

  // Images: use img tag
  if (mimeType?.startsWith('image/')) {
    return (
      <div className="flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Preview of ${fileName}`}
          className="max-w-full max-h-[600px] rounded border object-contain"
        />
      </div>
    );
  }

  // Unsupported type
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <ImageIcon className="h-12 w-12 mb-2" />
      <p className="text-sm">このファイル形式のプレビューには対応していません</p>
      <p className="text-xs mt-1">{mimeType ?? '不明'}</p>
    </div>
  );
}
