import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, parseQuery, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { journalExportQuerySchema } from '@/lib/validators/reports';
import { generateStandardCsv, generateYayoiCsv } from '@/lib/csv/journal-export';

/**
 * GET /api/v1/journals/export
 * Export confirmed journal entries as CSV.
 * Supports standard and yayoi (弥生会計) formats.
 * Requires: journals:view (admin, accounting)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const queryResult = parseQuery(journalExportQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { date_from, date_to, format } = queryResult.data;
  const admin = createAdminSupabase();

  // Fetch confirmed entries with lines
  const { data: entries, error } = await admin
    .from('journal_entries')
    .select('id, entry_date, description, journal_lines(line_no, account_code, account_name, debit, credit, tax_code, partner_id, department, memo)')
    .eq('tenant_id', result.auth.tenantId)
    .eq('status', 'confirmed')
    .gte('entry_date', date_from)
    .lte('entry_date', date_to)
    .order('entry_date', { ascending: true });

  if (error) {
    return internalError(`仕訳データの取得に失敗しました: ${error.message}`);
  }

  // Collect partner IDs for name resolution
  const partnerIds = new Set<string>();
  for (const entry of entries ?? []) {
    for (const line of (entry.journal_lines as Array<Record<string, unknown>>) ?? []) {
      if (line.partner_id) partnerIds.add(line.partner_id as string);
    }
  }

  // Fetch partner names
  const partnerNames = new Map<string, string>();
  if (partnerIds.size > 0) {
    const { data: partners } = await admin
      .from('partners')
      .select('id, name')
      .in('id', Array.from(partnerIds));
    for (const p of partners ?? []) {
      partnerNames.set(p.id, p.name);
    }
  }

  // Flatten to export lines
  const exportLines = (entries ?? []).flatMap((entry) =>
    ((entry.journal_lines as Array<Record<string, unknown>>) ?? []).map((line) => ({
      entry_date: entry.entry_date,
      entry_id: entry.id,
      description: entry.description as string | null,
      line_no: line.line_no as number,
      account_code: line.account_code as string,
      account_name: line.account_name as string | null,
      debit: line.debit as number,
      credit: line.credit as number,
      tax_code: line.tax_code as string | null,
      partner_name: line.partner_id ? (partnerNames.get(line.partner_id as string) ?? null) : null,
      department: line.department as string | null,
      memo: line.memo as string | null,
    }))
  );

  const csvContent = format === 'yayoi'
    ? generateYayoiCsv(exportLines)
    : generateStandardCsv(exportLines);

  const filename = format === 'yayoi'
    ? `journal_yayoi_${date_from}_${date_to}.csv`
    : `journal_${date_from}_${date_to}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
