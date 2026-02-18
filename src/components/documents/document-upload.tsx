'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText, ImageIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
];

interface UploadingFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface DocumentUploadProps {
  onUploadComplete?: () => void;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `ファイルサイズが上限(10MB)を超えています: ${(file.size / 1024 / 1024).toFixed(1)}MB`;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `対応していないファイル形式です: ${file.type || '不明'}`;
    }
    return null;
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const uploadingFiles: UploadingFile[] = fileArray.map((file) => {
      const error = validateFile(file);
      return { file, status: error ? 'error' as const : 'pending' as const, error: error ?? undefined };
    });
    setFiles((prev) => [...prev, ...uploadingFiles]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f))
      );

      try {
        const formData = new FormData();
        formData.append('file', files[i].file);

        const response = await fetch('/api/v1/documents/upload?auto_parse=true', {
          method: 'POST',
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error?.message ?? `Upload failed (${response.status})`);
        }

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'done' } : f))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'error', error: message } : f))
        );
      }
    }

    toast.success('アップロードが完了しました');
    onUploadComplete?.();
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Upload className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">
            ファイルをドラッグ＆ドロップ
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, JPEG, PNG, WebP, TIFF（10MB以内）
          </p>
          <Button variant="outline" size="sm" className="mt-3">
            ファイルを選択
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.tif"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </CardContent>
      </Card>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item, index) => (
            <div
              key={`${item.file.name}-${index}`}
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              {item.file.type.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1">{item.file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(item.file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              {item.status === 'uploading' && (
                <span className="text-xs text-blue-600 animate-pulse">アップロード中...</span>
              )}
              {item.status === 'done' && (
                <span className="text-xs text-green-600">完了</span>
              )}
              {item.status === 'error' && (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {item.error}
                </span>
              )}
              {(item.status === 'pending' || item.status === 'error') && (
                <button onClick={() => removeFile(index)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {pendingCount > 0 && (
            <Button onClick={uploadAll} className="w-full">
              {pendingCount}件をアップロード
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
