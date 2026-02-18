import type { Job } from 'bullmq';
import { createWorkerSupabase } from '../lib/supabase';
import { analyzeDocument, type DiModelId } from '../lib/di-client';
import { structureExtraction } from './structuring';
import { classifyExtraction, type ClassificationResult } from './classification';
import { checkDuplicates, type DuplicateSuspect } from './duplicate-check';
import { emitMetric, emitLatency, METRIC } from '../lib/metrics';

export interface DocumentParsePayload {
  documentId: string;
  tenantId: string;
}

const CONFIDENCE_FALLBACK_THRESHOLD = 0.5;

/**
 * document_parse job processor.
 * State transitions (P0-2 compliant):
 *   queued → processing  (Worker start — optimistic update)
 *   processing → extracted  (success)
 *   processing → error  (failure)
 */
export async function processDocumentParse(
  job: Job<DocumentParsePayload>
): Promise<void> {
  const { documentId, tenantId } = job.data;
  const startTime = Date.now();
  const supabase = createWorkerSupabase();

  // Structured log helper
  const log = (level: string, message: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      level,
      job: 'document_parse',
      jobId: job.id,
      documentId,
      tenantId,
      attempt: job.attemptsMade + 1,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    }));
  };

  log('info', 'Job started');

  // Step 1: Optimistic status update: queued → processing
  const { data: doc, error: updateError } = await supabase
    .from('documents')
    .update({ status: 'processing' })
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .eq('status', 'queued') // Optimistic lock — only proceed if still queued
    .select('storage_bucket, file_key, mime_type, file_name')
    .single();

  if (updateError || !doc) {
    log('warn', 'Skipped: document not in queued state or not found', {
      error: updateError?.message,
    });
    return; // Don't throw — skip gracefully (idempotency)
  }

  try {
    // Step 2: Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(doc.storage_bucket)
      .download(doc.file_key);

    if (downloadError || !fileData) {
      throw new Error(`Storage download failed: ${downloadError?.message}`);
    }

    const buffer = new Uint8Array(await fileData.arrayBuffer());
    const contentType = doc.mime_type || 'application/octet-stream';

    // Step 3: Call Azure DI with prebuilt-invoice model
    let modelId: DiModelId = 'prebuilt-invoice';
    let diResult = await analyzeDocument(buffer, contentType, modelId);

    // Step 3b: Fallback to prebuilt-read if confidence is low (P1-2)
    if (diResult.confidence < CONFIDENCE_FALLBACK_THRESHOLD && modelId === 'prebuilt-invoice') {
      log('info', 'Low confidence, falling back to prebuilt-read', {
        invoiceConfidence: diResult.confidence,
      });
      modelId = 'prebuilt-read';
      diResult = await analyzeDocument(buffer, contentType, modelId);
    }

    // Step 4: Structure extracted data
    const structured = structureExtraction(diResult);

    // Step 4b: Classify document (non-fatal)
    let classification: ClassificationResult;
    try {
      classification = await classifyExtraction(structured, modelId, doc.file_name);
      log('info', 'Classification complete', {
        documentType: classification.documentType,
        classificationConfidence: classification.confidence,
        classificationMethod: classification.method,
      });
    } catch (err) {
      classification = {
        documentType: 'other',
        confidence: 0,
        method: 'rule',
        reasoning: 'Classification failed unexpectedly',
      };
      log('warn', 'Classification failed, defaulting to other', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step 5: Save extraction to document_extractions
    const { error: extractionError } = await supabase
      .from('document_extractions')
      .insert({
        tenant_id: tenantId,
        document_id: documentId,
        extracted_json: { ...structured, classification },
        model_provider: 'azure',
        model_name: modelId,
        model_version: diResult.modelId,
        confidence: structured.confidence,
        extracted_at: new Date().toISOString(),
      });

    if (extractionError) {
      throw new Error(`Extraction insert failed: ${extractionError.message}`);
    }

    // Step 6: Update document with extracted values
    const { error: docUpdateError } = await supabase
      .from('documents')
      .update({
        status: 'extracted',
        document_type: classification.documentType,
        document_date: structured.document_date,
        amount: structured.total_amount,
        tax_amount: structured.tax_amount,
        registration_number: structured.vendor_registration_number,
      })
      .eq('id', documentId)
      .eq('tenant_id', tenantId);

    if (docUpdateError) {
      throw new Error(`Document update failed: ${docUpdateError.message}`);
    }

    // Step 7: Near-duplicate detection (non-fatal)
    let duplicateSuspects: DuplicateSuspect[] = [];
    try {
      const dupResult = await checkDuplicates({
        documentId,
        tenantId,
        documentDate: structured.document_date,
        amount: structured.total_amount,
      }, supabase);
      duplicateSuspects = dupResult.suspects;

      if (duplicateSuspects.length > 0) {
        await supabase
          .from('document_extractions')
          .update({
            extracted_json: { ...structured, classification, duplicate_suspects: duplicateSuspects },
          })
          .eq('document_id', documentId)
          .eq('tenant_id', tenantId);

        log('warn', 'Duplicate suspects found', { duplicateCount: duplicateSuspects.length });
      }
      emitMetric(METRIC.DUPLICATE_CHECK_COUNT, duplicateSuspects.length, { documentId });
    } catch (err) {
      log('warn', 'Duplicate check failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const latencyMs = Date.now() - startTime;
    log('info', 'Job succeeded', {
      latencyMs,
      confidence: structured.confidence,
      modelId,
      documentType: classification.documentType,
      classificationMethod: classification.method,
      duplicateCount: duplicateSuspects.length,
    });
    emitLatency(latencyMs, { documentId, tenantId, modelId });
    emitMetric(METRIC.OCR_JOB_SUCCESS, 1, { documentId, documentType: classification.documentType });
    emitMetric(METRIC.CLASSIFICATION_METHOD, 1, { method: classification.method });
    emitMetric(METRIC.OCR_RETRY_COUNT, job.attemptsMade, { documentId });
  } catch (error) {
    // Update status to error
    await supabase
      .from('documents')
      .update({ status: 'error' })
      .eq('id', documentId)
      .eq('tenant_id', tenantId);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const latencyMs = Date.now() - startTime;

    log('error', 'Job failed', { error: errorMessage, latencyMs });
    emitMetric(METRIC.OCR_JOB_FAILURE, 1, { documentId, tenantId });
    emitLatency(latencyMs, { documentId, tenantId, failed: true });
    emitMetric(METRIC.OCR_RETRY_COUNT, job.attemptsMade, { documentId });

    // Re-throw so BullMQ can retry
    throw error;
  }
}
