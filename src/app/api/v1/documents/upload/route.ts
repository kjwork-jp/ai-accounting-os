import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, badRequest, conflict, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';
import { enqueueDocumentParse } from '@/lib/queue/enqueue';
import { createHash } from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const STORAGE_BUCKET = 'documents';

/**
 * POST /api/v1/documents/upload
 * Upload a document file to Supabase Storage with SHA-256 hashing.
 * Duplicate detection is handled via SHA-256 hash comparison.
 */
export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const requestId = getRequestId(request);

  const admin = createAdminSupabase();

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return badRequest('ファイルが必要です。file フィールドにファイルを添付してください。');
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return badRequest(`ファイルサイズが上限(10MB)を超えています: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return badRequest(`対応していないファイル形式です: ${file.type}`);
  }

  // Read file buffer and compute SHA-256
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const sha256Hash = createHash('sha256').update(buffer).digest('hex');

  // Check for duplicate by hash within the same tenant (warn, don't block)
  const { data: duplicate } = await admin
    .from('documents')
    .select('id, file_name')
    .eq('tenant_id', result.auth.tenantId)
    .eq('file_hash_sha256', sha256Hash)
    .limit(1)
    .single();

  const duplicateWarning = duplicate
    ? `同一ファイルが既に登録されています: ${duplicate.file_name} (ID: ${duplicate.id})`
    : null;

  // Generate storage key: tenant_id/YYYY-MM/uuid_filename
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const uniqueId = crypto.randomUUID();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._\-\u3000-\u9fff]/g, '_');
  const fileKey = `${result.auth.tenantId}/${yearMonth}/${uniqueId}_${safeFileName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(fileKey, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return internalError(`ストレージへのアップロードに失敗しました: ${uploadError.message}`);
  }

  // Determine document type from MIME
  let documentType = 'other';
  if (file.type === 'application/pdf') documentType = 'invoice';
  else if (file.type.startsWith('image/')) documentType = 'receipt';
  else if (file.type === 'text/csv' || file.type.includes('spreadsheet')) documentType = 'bank_statement';

  // Insert document record
  const insertData: Record<string, unknown> = {
    tenant_id: result.auth.tenantId,
    storage_bucket: STORAGE_BUCKET,
    file_key: fileKey,
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
    file_hash_sha256: sha256Hash,
    document_type: documentType,
    status: 'uploaded',
    uploaded_by: result.auth.userId,
  };

  const { data: doc, error: insertError } = await admin
    .from('documents')
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    // Clean up uploaded file on insert failure
    await admin.storage.from(STORAGE_BUCKET).remove([fileKey]);
    return internalError(`ドキュメントの登録に失敗しました: ${insertError.message}`);
  }

  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'create',
    entityType: 'documents',
    entityId: doc.id,
    entityName: file.name,
    requestId,
  });

  // Auto-enqueue OCR if requested (for PDF/image files)
  const autoParse = request.nextUrl.searchParams.get('auto_parse') === 'true';
  const isOcrTarget = file.type === 'application/pdf' || file.type.startsWith('image/');
  let jobId: string | null = null;
  let enqueued = false;

  if (autoParse && isOcrTarget) {
    try {
      await admin
        .from('documents')
        .update({ status: 'queued' })
        .eq('id', doc.id)
        .eq('tenant_id', result.auth.tenantId);

      jobId = await enqueueDocumentParse({
        documentId: doc.id,
        tenantId: result.auth.tenantId,
      });
      enqueued = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(JSON.stringify({
        level: 'warn',
        route: 'documents/upload',
        message: 'Auto enqueue failed after upload',
        documentId: doc.id,
        tenantId: result.auth.tenantId,
        error: message,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  return ok({ data: { ...doc, jobId, enqueued, duplicateWarning } }, 201);
}
