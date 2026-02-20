import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, notFound, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';

/**
 * GET /api/v1/documents/:id/preview
 * Stream document file content for preview.
 * Bypasses signed URL issues by proxying through the API.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const { id: documentId } = await params;
  const admin = createAdminSupabase();

  const { data: doc, error: docError } = await admin
    .from('documents')
    .select('storage_bucket, file_key, mime_type, file_name')
    .eq('id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (docError || !doc) {
    return notFound('ドキュメントが見つかりません');
  }

  const { data: fileData, error: downloadError } = await admin.storage
    .from(doc.storage_bucket)
    .download(doc.file_key);

  if (downloadError || !fileData) {
    return internalError(
      `ファイルのダウンロードに失敗しました: ${downloadError?.message ?? 'unknown'}`
    );
  }

  const buffer = await fileData.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': doc.mime_type ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
