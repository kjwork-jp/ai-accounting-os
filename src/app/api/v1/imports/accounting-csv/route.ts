import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, badRequest, internalError, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { parseAccountingCsv } from '@/lib/csv/accounting-csv-parser';
import { accountingCsvTemplates, columnMappingSchema } from '@/lib/validators/imports';
import type { AccountingCsvTemplate, ColumnMapping } from '@/lib/validators/imports';
import { insertAuditLog } from '@/lib/audit/logger';

/**
 * POST /api/v1/imports/accounting-csv
 * Import accounting CSV from other software (yayoi, freee, moneyforward, custom).
 * Supports preview mode (returns first 20 rows) and import mode.
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
  const template = formData.get('template') as string | null;
  const preview = formData.get('preview') === 'true';
  const columnMappingRaw = formData.get('column_mapping') as string | null;

  if (!file || !(file instanceof File)) {
    return badRequest('CSVファイルが必要です');
  }

  if (!template || !(accountingCsvTemplates as readonly string[]).includes(template)) {
    return badRequest(`templateは ${accountingCsvTemplates.join(', ')} のいずれかを指定してください`);
  }

  // Parse custom column mapping if provided
  let columnMapping: ColumnMapping | undefined;
  if (template === 'custom' && columnMappingRaw) {
    try {
      const parsed = columnMappingSchema.safeParse(JSON.parse(columnMappingRaw));
      if (!parsed.success) {
        return badRequest('column_mappingの形式が不正です');
      }
      columnMapping = parsed.data;
    } catch {
      return badRequest('column_mappingのJSONが不正です');
    }
  } else if (template === 'custom' && !columnMappingRaw) {
    return badRequest('customテンプレートの場合はcolumn_mappingが必要です');
  }

  // Read file content
  let content: string;
  try {
    const buffer = await file.arrayBuffer();
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      content = new TextDecoder('shift_jis').decode(buffer);
    }
  } catch {
    return badRequest('ファイルの読み込みに失敗しました');
  }

  // Parse CSV
  const parseResult = parseAccountingCsv(
    content,
    template as AccountingCsvTemplate,
    columnMapping
  );

  // Preview mode: return headers and first 20 rows
  if (preview) {
    return ok({
      data: {
        headers: parseResult.headers,
        preview: parseResult.preview,
        total_rows: parseResult.rows.length,
        parse_errors: parseResult.errors.slice(0, 10),
      },
    });
  }

  // Import mode: create journal entries
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

  // Validate debit=credit balance before import
  const validRows = parseResult.rows.filter((row, idx) => {
    if (!row.debit_account_code || !row.credit_account_code) {
      parseResult.errors.push(`行${idx + 2}: 借方・貸方の両方の勘定科目が必要です`);
      return false;
    }
    if (row.debit_amount !== row.credit_amount) {
      parseResult.errors.push(`行${idx + 2}: 借方金額(${row.debit_amount})と貸方金額(${row.credit_amount})が一致しません`);
      return false;
    }
    return true;
  });
  skipped = parseResult.rows.length - validRows.length;

  // Batch insert entries (chunks of 100 to avoid payload limits)
  const BATCH_SIZE = 100;
  for (let batchStart = 0; batchStart < validRows.length; batchStart += BATCH_SIZE) {
    const batch = validRows.slice(batchStart, batchStart + BATCH_SIZE);

    const entryPayloads = batch.map((row) => ({
      tenant_id: result.auth.tenantId,
      entry_date: row.date,
      description: row.description,
      source_type: 'manual' as const,
      status: 'confirmed' as const,
      total_amount: row.debit_amount,
      tax_amount: 0,
      created_by: result.auth.userId,
    }));

    const { data: entries, error: entryError } = await admin
      .from('journal_entries')
      .insert(entryPayloads)
      .select('id');

    if (entryError || !entries) {
      console.error('[accounting-csv-import] Batch entry insert error:', entryError?.message);
      continue;
    }

    // Build journal lines for all entries in this batch
    const allLines: Array<Record<string, unknown>> = [];
    for (let i = 0; i < entries.length; i++) {
      const row = batch[i];
      const entryId = entries[i].id;

      allLines.push({
        tenant_id: result.auth.tenantId,
        journal_entry_id: entryId,
        line_no: 1,
        account_code: row.debit_account_code,
        account_name: row.debit_account_code,
        debit: row.debit_amount,
        credit: 0,
        tax_code: row.tax_code,
      });
      allLines.push({
        tenant_id: result.auth.tenantId,
        journal_entry_id: entryId,
        line_no: 2,
        account_code: row.credit_account_code,
        account_name: row.credit_account_code,
        debit: 0,
        credit: row.credit_amount,
        tax_code: row.tax_code,
      });
    }

    if (allLines.length > 0) {
      const { error: lineError } = await admin
        .from('journal_lines')
        .insert(allLines);

      if (lineError) {
        console.error('[accounting-csv-import] Batch line insert error:', lineError.message);
      }
    }

    imported += entries.length;
  }

  // Audit log
  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'journal.csv_import',
    entityType: 'journal_entries',
    entityId: undefined,
    diffJson: {
      template: { before: null, after: template },
      imported: { before: null, after: imported },
      skipped: { before: null, after: skipped },
      total_rows: { before: null, after: parseResult.rows.length },
    },
    requestId: getRequestId(request),
  });

  return ok({
    data: {
      imported,
      skipped,
      total_rows: parseResult.rows.length,
      parse_errors: parseResult.errors.slice(0, 10),
    },
  });
}
