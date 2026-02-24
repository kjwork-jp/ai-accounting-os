import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, badRequest, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { parseBankCsv, parseCreditCardCsv } from '@/lib/csv/bank-csv-parser';
import { insertAuditLog } from '@/lib/audit/logger';

/**
 * POST /api/v1/payments/import
 * Import bank or credit card CSV.
 * Accepts multipart/form-data with 'file' and 'payment_type'.
 * Requires: admin, accounting
 */
export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest('multipart/form-data形式でリクエストしてください');
  }

  const file = formData.get('file');
  const paymentType = formData.get('payment_type') as string | null;

  if (!file || !(file instanceof File)) {
    return badRequest('CSVファイルが必要です');
  }

  if (!paymentType || !['bank', 'credit_card'].includes(paymentType)) {
    return badRequest('payment_typeは bank または credit_card を指定してください');
  }

  // Read file content
  let content: string;
  try {
    const buffer = await file.arrayBuffer();
    // Try UTF-8 first, then fallback to Shift_JIS via TextDecoder
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      content = new TextDecoder('shift_jis').decode(buffer);
    }
  } catch {
    return badRequest('ファイルの読み込みに失敗しました');
  }

  // Parse CSV
  const parseResult = paymentType === 'credit_card'
    ? parseCreditCardCsv(content)
    : parseBankCsv(content);

  if (parseResult.rows.length === 0) {
    return badRequest(
      parseResult.errors.length > 0
        ? `CSVの解析に失敗しました: ${parseResult.errors[0]}`
        : '有効なデータ行がありません'
    );
  }

  const admin = createAdminSupabase();
  let imported = 0;
  let skipped = 0;

  for (const row of parseResult.rows) {
    // Duplicate check: same tenant, date, amount, counterparty
    const { data: existing } = await admin
      .from('payments')
      .select('id')
      .eq('tenant_id', result.auth.tenantId)
      .eq('occurred_on', row.occurred_on)
      .eq('amount', row.amount)
      .eq('counterparty_name_raw', row.counterparty_name_raw)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const { error } = await admin
      .from('payments')
      .insert({
        tenant_id: result.auth.tenantId,
        payment_type: paymentType,
        direction: row.direction,
        occurred_on: row.occurred_on,
        amount: row.amount,
        counterparty_name_raw: row.counterparty_name_raw,
        description: row.description,
        balance_after: row.balance ?? null,
        created_by: result.auth.userId,
      });

    if (error) {
      console.error('[payments/import] Insert error:', error.message);
      continue;
    }

    imported++;
  }

  // Audit log
  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'payment.import',
    entityType: 'payments',
    entityId: undefined,
    diffJson: {
      payment_type: { before: null, after: paymentType },
      imported: { before: null, after: imported },
      skipped: { before: null, after: skipped },
      format: { before: null, after: parseResult.format_detected },
    },
    requestId: getRequestId(request),
  });

  return ok({
    data: {
      imported,
      skipped,
      total_rows: parseResult.rows.length,
      format_detected: parseResult.format_detected,
      parse_errors: parseResult.errors.slice(0, 10), // Limit error messages
    },
  });
}
