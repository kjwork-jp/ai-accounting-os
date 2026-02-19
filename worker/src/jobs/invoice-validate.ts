import type { Job } from 'bullmq';
import { createWorkerSupabase } from '../lib/supabase';
import { emitMetric, METRIC } from '../lib/metrics';
import { enqueueJournalSuggest } from '../lib/enqueue-light';

export interface InvoiceValidatePayload {
  documentId: string;
  tenantId: string;
}

interface CheckReason {
  field: string;
  severity: 'ng' | 'needs_review';
  message: string;
}

/**
 * invoice_validate job processor.
 * Checks extracted document data against invoice compliance requirements (PO-005/SO-005).
 *
 * State flow:
 *   document.status = 'extracted' (precondition)
 *   → invoice_checks INSERT (ok / needs_review / ng)
 *   → ok or needs_review → enqueue journal_suggest
 *   → ng → no further processing
 */
export async function processInvoiceValidate(
  job: Job<InvoiceValidatePayload>
): Promise<{ status: 'ok' | 'needs_review' | 'ng'; checkId: string }> {
  const { documentId, tenantId } = job.data;
  const startTime = Date.now();
  const supabase = createWorkerSupabase();

  const log = (level: string, message: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      level,
      job: 'invoice_validate',
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

  // Step 1: Fetch extraction
  const { data: extraction, error: extError } = await supabase
    .from('document_extractions')
    .select('extracted_json')
    .eq('document_id', documentId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (extError || !extraction) {
    throw new Error(`Extraction not found for document ${documentId}: ${extError?.message}`);
  }

  const ext = extraction.extracted_json as Record<string, unknown>;

  // Step 2: Run checks
  const reasons: CheckReason[] = [];

  // Check 1: Vendor name (NG if missing)
  if (!ext.vendor_name || (typeof ext.vendor_name === 'string' && ext.vendor_name.trim() === '')) {
    reasons.push({ field: 'vendor_name', severity: 'ng', message: '発行者名称が未記載です' });
  }

  // Check 2: Registration number
  const regNum = ext.vendor_registration_number;
  if (!regNum) {
    reasons.push({ field: 'vendor_registration_number', severity: 'needs_review', message: '登録番号が未記載です' });
  } else if (typeof regNum === 'string' && !/^T\d{13}$/.test(regNum)) {
    reasons.push({ field: 'vendor_registration_number', severity: 'needs_review', message: '登録番号の形式が不正です (T+13桁)' });
  }

  // Check 3: Document date (NG if missing)
  if (!ext.document_date) {
    reasons.push({ field: 'document_date', severity: 'ng', message: '取引年月日が未記載です' });
  }

  // Check 4: Line items descriptions
  const lineItems = ext.line_items;
  if (Array.isArray(lineItems)) {
    const allEmpty = lineItems.every(
      (item: Record<string, unknown>) => !item.description || (typeof item.description === 'string' && item.description.trim() === '')
    );
    if (lineItems.length === 0 || allEmpty) {
      reasons.push({ field: 'line_items', severity: 'needs_review', message: '取引内容（明細）が未記載です' });
    }
  } else {
    reasons.push({ field: 'line_items', severity: 'needs_review', message: '取引内容（明細）が未記載です' });
  }

  // Check 5: Tax details
  const taxDetails = ext.tax_details;
  if (!Array.isArray(taxDetails) || taxDetails.length === 0) {
    reasons.push({ field: 'tax_details', severity: 'needs_review', message: '税率区分別対価が未記載です' });
  }

  // Check 6: Tax amount
  if (ext.tax_amount == null) {
    reasons.push({ field: 'tax_amount', severity: 'needs_review', message: '消費税額が未記載です' });
  }

  // Check 7: Total amount (NG if missing)
  if (ext.total_amount == null) {
    reasons.push({ field: 'total_amount', severity: 'ng', message: '合計金額が未記載です' });
  }

  // Step 3: Determine overall status
  const hasNg = reasons.some(r => r.severity === 'ng');
  const hasNeedsReview = reasons.some(r => r.severity === 'needs_review');
  const status: 'ok' | 'needs_review' | 'ng' = hasNg ? 'ng' : hasNeedsReview ? 'needs_review' : 'ok';

  // Step 4: Insert invoice_checks
  const { data: check, error: insertError } = await supabase
    .from('invoice_checks')
    .insert({
      tenant_id: tenantId,
      document_id: documentId,
      status,
      reasons: reasons as unknown as Record<string, unknown>,
      checked_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError || !check) {
    throw new Error(`invoice_checks insert failed: ${insertError?.message}`);
  }

  // Step 5: Chain → journal_suggest if ok or needs_review
  if (status === 'ok' || status === 'needs_review') {
    try {
      await enqueueJournalSuggest({ documentId, tenantId });
      log('info', 'Chained journal_suggest job');
    } catch (err) {
      log('warn', 'Failed to enqueue journal_suggest (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    log('info', 'Skipping journal_suggest — invoice check status is ng');
  }

  const latencyMs = Date.now() - startTime;
  log('info', 'Job succeeded', {
    status,
    reasonCount: reasons.length,
    checkId: check.id,
    latencyMs,
  });
  emitMetric(METRIC.INVOICE_VALIDATE_SUCCESS, 1, { documentId, status });

  return { status, checkId: check.id };
}
