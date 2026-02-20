import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound, conflict, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog, computeDiff } from '@/lib/audit/logger';
import { enqueueDocumentParse } from '@/lib/queue/enqueue';

/**
 * POST /api/v1/documents/:id/retry
 * Retry OCR processing for a failed or stuck-queued document.
 * State transition: error/queued → queued (re-enqueue to Redis)
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

  // Precondition: only error or queued status can be retried
  const retryableStatuses = ['error', 'queued'] as const;
  if (!retryableStatuses.includes(doc.status as typeof retryableStatuses[number])) {
    return conflict(
      `現在のステータス「${doc.status}」ではリトライできません。エラーまたはキュー待ち状態のドキュメントのみリトライ可能です。`
    );
  }

  const previousStatus = doc.status;

  // Optimistic update: error/queued → queued
  const updateResult = await admin
    .from('documents')
    .update({ status: 'queued' })
    .eq('id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .in('status', [...retryableStatuses])
    .select('id')
    .single();

  if (updateResult.error) {
    return internalError(`ステータス更新に失敗しました: ${updateResult.error.message}`);
  }

  if (!updateResult.data) {
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
        { status: previousStatus },
        { status: 'queued' }
      ),
      requestId,
    });

    return ok({ data: { jobId, status: 'queued' } });
  } catch (error) {
    // Rollback status on enqueue failure
    await admin
      .from('documents')
      .update({ status: previousStatus })
      .eq('id', documentId)
      .eq('tenant_id', result.auth.tenantId);

    const message = error instanceof Error ? error.message : String(error);
    return internalError(`ジョブの投入に失敗しました: ${message}`);
  }
}
