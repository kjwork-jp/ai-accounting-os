import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, parseQuery, internalError } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { trialBalanceQuerySchema } from '@/lib/validators/reports';

/**
 * GET /api/v1/reports/trial-balance
 * Monthly trial balance (月次試算表).
 * Aggregates confirmed journal lines by account for a given month.
 * Requires: reports:view (admin, accounting, viewer)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const queryResult = parseQuery(trialBalanceQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { year_month, comparison } = queryResult.data;
  const admin = createAdminSupabase();

  // Compute date range for the target month
  const [year, month] = year_month.split('-').map(Number);
  const dateFrom = `${year_month}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year_month}-${String(lastDay).padStart(2, '0')}`;

  // Fetch confirmed journal entries for the month
  const accounts = await aggregateByAccount(admin, result.auth.tenantId, dateFrom, dateTo);

  // Fetch comparison month if requested
  let prevAccounts: Map<string, AccountAggregate> | undefined;
  if (comparison) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const prevDateFrom = `${prevYearMonth}-01`;
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevDateTo = `${prevYearMonth}-${String(prevLastDay).padStart(2, '0')}`;
    prevAccounts = await aggregateByAccount(admin, result.auth.tenantId, prevDateFrom, prevDateTo);
  }

  // Fetch account master for category info
  const { data: masterAccounts } = await admin
    .from('m_accounts')
    .select('code, name, category')
    .eq('tenant_id', result.auth.tenantId)
    .eq('is_active', true)
    .order('code');

  const accountMaster = new Map(
    (masterAccounts ?? []).map((a) => [a.code, { name: a.name, category: a.category }])
  );

  // Build response
  const allCodes = new Set([...accounts.keys(), ...(prevAccounts?.keys() ?? [])]);
  const accountRows = Array.from(allCodes)
    .sort()
    .map((code) => {
      const current = accounts.get(code) ?? { debit: 0, credit: 0 };
      const prev = prevAccounts?.get(code);
      const master = accountMaster.get(code);
      const balance = current.debit - current.credit;
      return {
        code,
        name: master?.name ?? current.name ?? code,
        category: master?.category ?? 'expense',
        debit_total: current.debit,
        credit_total: current.credit,
        balance,
        ...(comparison ? { prev_balance: prev ? prev.debit - prev.credit : 0 } : {}),
      };
    });

  let totalDebit = 0;
  let totalCredit = 0;
  for (const row of accountRows) {
    totalDebit += row.debit_total;
    totalCredit += row.credit_total;
  }

  return ok({
    data: {
      year_month,
      accounts: accountRows,
      summary: {
        total_debit: totalDebit,
        total_credit: totalCredit,
      },
    },
  });
}

interface AccountAggregate {
  debit: number;
  credit: number;
  name?: string;
}

async function aggregateByAccount(
  admin: ReturnType<typeof createAdminSupabase>,
  tenantId: string,
  dateFrom: string,
  dateTo: string
): Promise<Map<string, AccountAggregate>> {
  // Get confirmed entry IDs for the period
  const { data: entries } = await admin
    .from('journal_entries')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'confirmed')
    .gte('entry_date', dateFrom)
    .lte('entry_date', dateTo);

  if (!entries || entries.length === 0) {
    return new Map();
  }

  const entryIds = entries.map((e) => e.id);

  // Fetch all journal lines for these entries
  const { data: lines } = await admin
    .from('journal_lines')
    .select('account_code, account_name, debit, credit')
    .eq('tenant_id', tenantId)
    .in('journal_entry_id', entryIds);

  const result = new Map<string, AccountAggregate>();
  for (const line of lines ?? []) {
    const existing = result.get(line.account_code) ?? { debit: 0, credit: 0 };
    existing.debit += line.debit;
    existing.credit += line.credit;
    if (line.account_name) existing.name = line.account_name;
    result.set(line.account_code, existing);
  }

  return result;
}
