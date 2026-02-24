import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, badRequest, internalError, parseBody, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { reconciliationSuggestSchema } from '@/lib/validators/payments';
import { findReconciliationCandidates } from '@/lib/reconciliation/matcher';
import { insertAuditLog } from '@/lib/audit/logger';

/**
 * POST /api/v1/reconciliations/suggest
 * Generate reconciliation suggestions by matching payments to journal entries.
 * Requires: admin, accounting
 */
export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseBody(reconciliationSuggestSchema, body);
  if ('error' in parsed) return parsed.error;

  const { date_from, date_to } = parsed.data;
  const admin = createAdminSupabase();

  // Fetch unreconciled payments
  const { data: allPayments, error: paymentsError } = await admin
    .from('payments')
    .select('id, occurred_on, amount, direction, counterparty_name_raw')
    .eq('tenant_id', result.auth.tenantId)
    .gte('occurred_on', date_from)
    .lte('occurred_on', date_to);

  if (paymentsError) {
    return internalError(`明細の取得に失敗しました: ${paymentsError.message}`);
  }

  // Filter out already reconciled payments
  const { data: existingReconciliations } = await admin
    .from('reconciliations')
    .select('payment_id')
    .eq('tenant_id', result.auth.tenantId)
    .in('status', ['suggested', 'confirmed']);

  const reconciledPaymentIds = new Set(
    (existingReconciliations ?? []).map((r) => r.payment_id)
  );

  const unreconciledPayments = (allPayments ?? []).filter(
    (p) => !reconciledPaymentIds.has(p.id)
  );

  // Fetch confirmed journal entries in range
  const { data: entries, error: entriesError } = await admin
    .from('journal_entries')
    .select('id, entry_date, total_amount, description')
    .eq('tenant_id', result.auth.tenantId)
    .eq('status', 'confirmed')
    .gte('entry_date', date_from)
    .lte('entry_date', date_to);

  if (entriesError) {
    return internalError(`仕訳の取得に失敗しました: ${entriesError.message}`);
  }

  // Filter out already reconciled entries
  const { data: existingEntryReconciliations } = await admin
    .from('reconciliations')
    .select('target_id')
    .eq('tenant_id', result.auth.tenantId)
    .eq('target_type', 'journal_entry')
    .in('status', ['suggested', 'confirmed']);

  const reconciledEntryIds = new Set(
    (existingEntryReconciliations ?? []).map((r) => r.target_id)
  );

  const unreconciledEntries = (entries ?? []).filter(
    (e) => !reconciledEntryIds.has(e.id)
  );

  // Find candidates
  const candidates = findReconciliationCandidates(
    unreconciledPayments,
    unreconciledEntries
  );

  // Insert suggestions into reconciliations table
  let created = 0;
  for (const candidate of candidates) {
    const { error } = await admin
      .from('reconciliations')
      .insert({
        tenant_id: result.auth.tenantId,
        payment_id: candidate.payment_id,
        target_type: candidate.target_type,
        target_id: candidate.target_id,
        confidence: candidate.confidence,
        status: 'suggested',
        match_reasons: candidate.match_reasons,
      });

    if (!error) created++;
  }

  // Audit log
  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'reconciliation.suggest',
    entityType: 'reconciliations',
    entityId: undefined,
    diffJson: {
      period: { before: null, after: `${date_from} ~ ${date_to}` },
      candidates_found: { before: null, after: candidates.length },
      created: { before: null, after: created },
    },
    requestId: getRequestId(request),
  });

  return ok({
    data: {
      suggestions: candidates,
      summary: {
        total_unreconciled_payments: unreconciledPayments.length,
        total_unreconciled_entries: unreconciledEntries.length,
        matched: candidates.length,
        unmatched_payments: unreconciledPayments.length - candidates.length,
      },
    },
  });
}
