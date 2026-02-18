import { NextRequest } from 'next/server';
import { requireAuth, ok, badRequest, conflict, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';
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
 * Supports Idempotency-Key header to prevent duplicate uploads.
 */
export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const requestId = getRequestId(request);
  const idempotencyKey = request.headers.get('idempotency-key');

  const admin = createAdminSupabase();

  // Idempotency check: if same key was used before, return existing document
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from('documents')
      .select('*')
      .eq('tenant_id', result.auth.tenantId)
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existing) {
      return ok({ data: existing, deduplicated: true });
    }
  }

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

  // Check for duplicate by hash within the same tenant
  const { data: duplicate } = await admin
    .from('documents')
    .select('id, file_name')
    .eq('tenant_id', result.auth.tenantId)
    .eq('file_hash_sha256', sha256Hash)
    .limit(1)
    .single();

  if (duplicate) {
    return conflict(
      `同一ファイルが既に登録されています: ${duplicate.file_name} (ID: ${duplicate.id})`
    );
  }

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

  if (idempotencyKey) {
    insertData.idempotency_key = idempotencyKey;
  }

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

  return ok({ data: doc }, 201);
}
