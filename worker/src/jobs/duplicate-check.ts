import type { SupabaseClient } from '@supabase/supabase-js';

export interface DuplicateSuspect {
  document_id: string;
  file_name: string;
  match_reason: 'date_amount';
}

export interface DuplicateCheckInput {
  documentId: string;
  tenantId: string;
  documentDate: string | null;
  amount: number | null;
}

export interface DuplicateCheckResult {
  suspects: DuplicateSuspect[];
  checkedAt: string;
}

/**
 * Check for near-duplicate documents within the same tenant.
 * Match criteria: document_date ±3 days + exact amount match.
 * Non-fatal — callers should catch errors.
 */
export async function checkDuplicates(
  input: DuplicateCheckInput,
  supabase: SupabaseClient,
): Promise<DuplicateCheckResult> {
  const { documentId, tenantId, documentDate, amount } = input;

  // Early return if key fields are missing
  if (documentDate == null || amount == null) {
    return { suspects: [], checkedAt: new Date().toISOString() };
  }

  // Calculate ±3 day window using native Date
  const baseDate = new Date(documentDate);
  const dateFrom = new Date(baseDate);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 3);
  const dateTo = new Date(baseDate);
  dateTo.setUTCDate(dateTo.getUTCDate() + 3);

  const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('documents')
    .select('id, file_name')
    .eq('tenant_id', tenantId)
    .eq('amount', amount)
    .gte('document_date', formatDate(dateFrom))
    .lte('document_date', formatDate(dateTo))
    .neq('id', documentId)
    .in('status', ['extracted', 'verified'])
    .limit(10);

  if (error) {
    throw new Error(`Duplicate check query failed: ${error.message}`);
  }

  const suspects: DuplicateSuspect[] = (data ?? []).map((row) => ({
    document_id: row.id,
    file_name: row.file_name,
    match_reason: 'date_amount' as const,
  }));

  return { suspects, checkedAt: new Date().toISOString() };
}
