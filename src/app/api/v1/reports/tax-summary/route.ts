import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, parseQuery, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { taxSummaryQuerySchema } from '@/lib/validators/reports';

/**
 * GET /api/v1/reports/tax-summary
 * Tax summary by rate (消費税集計).
 * Aggregates journal lines by tax_code for confirmed entries in range.
 * Requires: reports:view (admin, accounting, viewer)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const queryResult = parseQuery(taxSummaryQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { date_from, date_to } = queryResult.data;
  const admin = createAdminSupabase();

  // Get confirmed entry IDs for the period
  const { data: entries, error: entriesError } = await admin
    .from('journal_entries')
    .select('id')
    .eq('tenant_id', result.auth.tenantId)
    .eq('status', 'confirmed')
    .gte('entry_date', date_from)
    .lte('entry_date', date_to);

  if (entriesError) {
    return internalError(`仕訳データの取得に失敗しました: ${entriesError.message}`);
  }

  if (!entries || entries.length === 0) {
    return ok({
      data: {
        period: { from: date_from, to: date_to },
        tax_rates: [],
        total: {
          taxable_sales: 0,
          total_tax_on_sales: 0,
          taxable_purchases: 0,
          total_tax_on_purchases: 0,
          net_tax_payable: 0,
        },
      },
    });
  }

  const entryIds = entries.map((e) => e.id);

  // Fetch all journal lines
  const { data: lines, error: linesError } = await admin
    .from('journal_lines')
    .select('account_code, account_name, debit, credit, tax_code')
    .eq('tenant_id', result.auth.tenantId)
    .in('journal_entry_id', entryIds);

  if (linesError) {
    return internalError(`仕訳明細の取得に失敗しました: ${linesError.message}`);
  }

  // Fetch account master for category classification
  const { data: accounts } = await admin
    .from('m_accounts')
    .select('code, category')
    .eq('tenant_id', result.auth.tenantId);

  const accountCategories = new Map(
    (accounts ?? []).map((a) => [a.code, a.category as string])
  );

  // Tax code → rate mapping
  const TAX_RATES: Record<string, number> = {
    TAX10: 10,
    TAX8: 8,
    NONTAX: 0,
    EXEMPT: 0,
  };

  // Aggregate by tax_code
  interface TaxAggregate {
    taxable_sales: number;
    tax_on_sales: number;
    taxable_purchases: number;
    tax_on_purchases: number;
  }

  const taxMap = new Map<string, TaxAggregate>();

  for (const line of lines ?? []) {
    const taxCode = line.tax_code ?? 'NONTAX';
    const rate = TAX_RATES[taxCode] ?? 0;
    const category = accountCategories.get(line.account_code) ?? 'expense';

    const existing = taxMap.get(taxCode) ?? {
      taxable_sales: 0,
      tax_on_sales: 0,
      taxable_purchases: 0,
      tax_on_purchases: 0,
    };

    // Revenue accounts → sales side; expense/asset accounts → purchase side
    if (category === 'revenue') {
      const amount = line.credit - line.debit; // revenue is credit-side
      existing.taxable_sales += Math.abs(amount);
      if (rate > 0) {
        existing.tax_on_sales += Math.round(Math.abs(amount) * rate / (100 + rate));
      }
    } else if (category === 'expense' || category === 'asset') {
      const amount = line.debit - line.credit; // expense is debit-side
      existing.taxable_purchases += Math.abs(amount);
      if (rate > 0) {
        existing.tax_on_purchases += Math.round(Math.abs(amount) * rate / (100 + rate));
      }
    }

    taxMap.set(taxCode, existing);
  }

  const taxRates = Array.from(taxMap.entries())
    .map(([taxCode, agg]) => ({
      tax_code: taxCode,
      rate: TAX_RATES[taxCode] ?? 0,
      taxable_sales: agg.taxable_sales,
      tax_on_sales: agg.tax_on_sales,
      taxable_purchases: agg.taxable_purchases,
      tax_on_purchases: agg.tax_on_purchases,
      net_tax: agg.tax_on_sales - agg.tax_on_purchases,
    }))
    .sort((a, b) => b.rate - a.rate);

  const total = {
    taxable_sales: taxRates.reduce((s, r) => s + r.taxable_sales, 0),
    total_tax_on_sales: taxRates.reduce((s, r) => s + r.tax_on_sales, 0),
    taxable_purchases: taxRates.reduce((s, r) => s + r.taxable_purchases, 0),
    total_tax_on_purchases: taxRates.reduce((s, r) => s + r.tax_on_purchases, 0),
    net_tax_payable: taxRates.reduce((s, r) => s + r.net_tax, 0),
  };

  return ok({
    data: {
      period: { from: date_from, to: date_to },
      tax_rates: taxRates,
      total,
    },
  });
}
