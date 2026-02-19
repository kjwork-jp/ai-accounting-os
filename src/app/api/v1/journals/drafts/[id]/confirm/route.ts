import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  parseBody,
  ok,
  badRequest,
  notFound,
  conflict,
  internalError,
  getRequestId,
} from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { journalConfirmSchema } from '@/lib/validators/journals';
import { insertAuditLog } from '@/lib/audit/logger';

/**
 * POST /api/v1/journals/drafts/:id/confirm
 * Confirm a journal draft — creates journal_entry + journal_lines.
 * Requires: journals:confirm (admin, accounting)
 *
 * Implements plan §2.5 data flow with:
 *   - Optimistic locking (WBS 3.1 H-2 pattern)
 *   - Debit/credit balance validation
 *   - feedback_events recording (CMN-006/ACC-019)
 *   - Audit log (CMN-005)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const { id: draftId } = await params;
  const requestId = getRequestId(request);
  const admin = createAdminSupabase();

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const bodyResult = parseBody(journalConfirmSchema, body);
  if ('error' in bodyResult) return bodyResult.error;

  const { selectedIndex, overrideLines, overrideDescription, overrideReason } = bodyResult.data;

  // Step 1: Fetch draft with optimistic lock — must be suggested or needs_review
  const { data: draft, error: draftError } = await admin
    .from('journal_drafts')
    .select('*, documents(id, document_date)')
    .eq('id', draftId)
    .eq('tenant_id', result.auth.tenantId)
    .in('status', ['suggested', 'needs_review'])
    .single();

  if (draftError || !draft) {
    // Check if already confirmed
    const { data: existingDraft } = await admin
      .from('journal_drafts')
      .select('status')
      .eq('id', draftId)
      .eq('tenant_id', result.auth.tenantId)
      .single();

    if (existingDraft?.status === 'confirmed') {
      return conflict('この仕訳候補は既に確定済みです。ページを再読み込みしてください。');
    }
    return notFound('仕訳候補が見つかりません');
  }

  // Step 2: Extract selected candidate
  const candidates = draft.candidates_json as Array<{
    lines: Array<{
      account_code: string;
      account_name: string;
      debit: number;
      credit: number;
      tax_code: string | null;
      partner_id?: string | null;
      department?: string | null;
      memo: string;
    }>;
    description: string;
    reasoning: string;
    confidence: number;
  }>;

  if (!Array.isArray(candidates) || selectedIndex >= candidates.length) {
    return badRequest(`selectedIndex ${selectedIndex} is out of range (candidates: ${Array.isArray(candidates) ? candidates.length : 0})`);
  }

  const selected = candidates[selectedIndex];

  // Step 3: Determine final lines and description
  const finalLines = overrideLines ?? selected.lines;
  const finalDescription = overrideDescription ?? selected.description;
  const isOverride = !!overrideLines;

  // Step 4: Validate debit/credit balance
  const totalDebit = finalLines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = finalLines.reduce((sum, l) => sum + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return badRequest(`借方合計(${totalDebit})と貸方合計(${totalCredit})が一致しません`);
  }

  // Step 5: Validate account codes exist
  const accountCodes = finalLines.map(l => l.account_code);
  const { data: validAccounts, error: accErr } = await admin
    .from('m_accounts')
    .select('code')
    .eq('tenant_id', result.auth.tenantId)
    .eq('is_active', true)
    .in('code', accountCodes);

  if (accErr) {
    return internalError(accErr.message);
  }

  const validCodes = new Set((validAccounts ?? []).map(a => a.code));
  const invalidCodes = accountCodes.filter(c => !validCodes.has(c));
  if (invalidCodes.length > 0) {
    return badRequest(`無効な勘定科目コード: ${invalidCodes.join(', ')}`);
  }

  // Step 6: Calculate totals
  const taxAmount = finalLines.reduce((sum, l) => {
    if (l.tax_code === 'TAX10') return sum + (l.debit || l.credit) * 0.1;
    if (l.tax_code === 'TAX8') return sum + (l.debit || l.credit) * 0.08;
    return sum;
  }, 0);

  const documentDate = (draft.documents as { document_date?: string } | null)?.document_date;
  const entryDate = documentDate ?? new Date().toISOString().slice(0, 10);

  // Step 7: Insert journal_entry
  const { data: entry, error: entryErr } = await admin
    .from('journal_entries')
    .insert({
      tenant_id: result.auth.tenantId,
      entry_date: entryDate,
      description: finalDescription,
      source_type: 'document',
      source_id: draft.document_id,
      status: 'confirmed',
      total_amount: totalDebit,
      tax_amount: Math.round(taxAmount * 100) / 100,
      journal_draft_id: draftId,
      confirmed_by: result.auth.userId,
      confirmed_at: new Date().toISOString(),
      created_by: result.auth.userId,
    })
    .select('id')
    .single();

  if (entryErr || !entry) {
    return internalError(`仕訳登録に失敗しました: ${entryErr?.message}`);
  }

  // Step 8: Insert journal_lines
  const lineInserts = finalLines.map((line, idx) => ({
    tenant_id: result.auth.tenantId,
    journal_entry_id: entry.id,
    line_no: idx + 1,
    account_code: line.account_code,
    account_name: line.account_name,
    debit: line.debit || 0,
    credit: line.credit || 0,
    tax_code: line.tax_code,
    partner_id: line.partner_id ?? null,
    department: line.department ?? null,
    memo: line.memo || '',
  }));

  const { error: linesErr } = await admin
    .from('journal_lines')
    .insert(lineInserts);

  if (linesErr) {
    // Attempt rollback: delete entry
    await admin.from('journal_entries').delete().eq('id', entry.id);
    return internalError(`仕訳明細の登録に失敗しました: ${linesErr.message}`);
  }

  // Step 9: Update journal_draft status
  const { error: draftUpdateErr } = await admin
    .from('journal_drafts')
    .update({
      status: 'confirmed',
      selected_index: selectedIndex,
      confirmed_by: result.auth.userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('tenant_id', result.auth.tenantId)
    .in('status', ['suggested', 'needs_review']) // Optimistic lock
    .select('id')
    .single();

  if (draftUpdateErr) {
    // Rollback entry + lines
    await admin.from('journal_lines').delete().eq('journal_entry_id', entry.id);
    await admin.from('journal_entries').delete().eq('id', entry.id);
    return conflict('別のリクエストによりステータスが変更されました。ページを再読み込みしてください。');
  }

  // Step 10: Insert feedback_event (CMN-006/ACC-019)
  try {
    await admin
      .from('feedback_events')
      .insert({
        tenant_id: result.auth.tenantId,
        user_id: result.auth.userId,
        entity_type: 'journal_draft',
        entity_id: draftId,
        ai_output_json: { candidates } as unknown as Record<string, unknown>,
        user_correction_json: {
          selected_index: selectedIndex,
          override: isOverride,
          override_reason: overrideReason ?? null,
          final_lines: finalLines,
          final_description: finalDescription,
        } as unknown as Record<string, unknown>,
      });
  } catch (err) {
    // Non-fatal — log but don't fail the confirm
    console.log(JSON.stringify({
      level: 'warn',
      message: 'feedback_events insert failed (non-fatal)',
      draftId,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
  }

  // Step 11: Audit log
  try {
    await insertAuditLog({
      tenantId: result.auth.tenantId,
      actorUserId: result.auth.userId,
      action: 'confirm',
      entityType: 'journal_entries',
      entityId: entry.id,
      diffJson: {
        draft_id: draftId,
        selected_index: selectedIndex,
        override: isOverride,
        ...(overrideReason ? { override_reason: overrideReason } : {}),
      },
      requestId,
    });
  } catch (err) {
    console.log(JSON.stringify({
      level: 'warn',
      message: 'Audit log insert failed (non-fatal)',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
  }

  // Step 12: Emit metrics (structured JSON for container logging)
  console.log(JSON.stringify({
    metric: 'journal_confirm_count',
    value: 1,
    labels: { draftId, entryId: entry.id, override: isOverride },
    timestamp: new Date().toISOString(),
  }));
  if (isOverride) {
    console.log(JSON.stringify({
      metric: 'journal_override_count',
      value: 1,
      labels: { draftId, entryId: entry.id },
      timestamp: new Date().toISOString(),
    }));
  }

  return ok({
    data: {
      journal_entry_id: entry.id,
      journal_draft_id: draftId,
      status: 'confirmed',
    },
  }, 201);
}
