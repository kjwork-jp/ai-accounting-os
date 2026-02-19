import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound, conflict, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog, computeDiff } from '@/lib/audit/logger';
import { enqueueDocumentParse } from '@/lib/queue/enqueue';

/**
 * POST /api/v1/documents/:id/retry
 * Retry OCR processing for a failed document.
 * State transition: error → queued (P0-2 compliant)
 * Separate from enqueue-parse for audit trail clarity.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const { id: documentId } = await params;
  const requestId = getRequestId(request);
  const admin = createAdminSupabase();

  // Fetch document and verify ownership
  const { data: doc, error: fetchError } = await admin
    .from('documents')
    .select('id, status, file_name')
    .eq('id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (fetchError || !doc) {
    return notFound('ドキュメントが見つかりません');
  }

  // Precondition: only error status can be retried
  if (doc.status !== 'error') {
    return conflict(
      `現在のステータス「${doc.status}」ではリトライできません。エラー状態のドキュメントのみリトライ可能です。`
    );
  }

  // Optimistic update: error → queued
  const { data: updatedDoc, error: updateError } = await admin
    .from('documents')
    .update({ status: 'queued' })
    .eq('id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .eq('status', 'error') // Optimistic lock
    .select('id')
    .single();

  if (updateError || !updated) {
    return conflict('別のリクエストによりステータスが変更されました。ページを再読み込みしてください。');
  }

  if (!updatedDoc) {
    return conflict('他の処理によりステータスが更新されたため、リトライできませんでした。再読み込み後に再実行してください。');
  }

  if (!updatedDoc) {
    return conflict('他の処理によりステータスが更新されたため、リトライできませんでした。再読み込み後に再実行してください。');
  }

  // Enqueue BullMQ job
  try {
    const jobId = await enqueueDocumentParse({
      documentId,
      tenantId: result.auth.tenantId,
    });

    await insertAuditLog({
      tenantId: result.auth.tenantId,
      actorUserId: result.auth.userId,
      action: 'update',
      entityType: 'documents',
      entityId: documentId,
      entityName: doc.file_name,
      diffJson: computeDiff(
        { status: 'error' },
        { status: 'queued' }
      ),
      requestId,
    });

    return ok({ data: { jobId, status: 'queued' } });
  } catch (error) {
    // Rollback status on enqueue failure
    await admin
      .from('documents')
      .update({ status: 'error' })
      .eq('id', documentId)
      .eq('tenant_id', result.auth.tenantId);

    const message = error instanceof Error ? error.message : String(error);
    return internalError(`ジョブの投入に失敗しました: ${message}`);
  }
}
