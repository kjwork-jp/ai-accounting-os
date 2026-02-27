/**
 * Accounting CSV parser with 3 preset templates + custom mapping.
 * Templates: 弥生会計 (yayoi), freee, Money Forward (moneyforward)
 * See WBS 3.7.1-3.7.3 / ACC-004.
 */

import type { ColumnMapping, AccountingCsvTemplate } from '@/lib/validators/imports';
import { parseCsvLine } from './csv-utils';

export interface ParsedJournalRow {
  date: string; // YYYY-MM-DD
  description: string;
  debit_account_code: string;
  debit_amount: number;
  credit_account_code: string;
  credit_amount: number;
  tax_code: string | null;
}

export interface AccountingCsvParseResult {
  rows: ParsedJournalRow[];
  headers: string[];
  preview: string[][]; // First 20 raw rows for preview
  errors: string[];
}

/**
 * Preset column mappings for each template.
 */
const TEMPLATE_MAPPINGS: Record<Exclude<AccountingCsvTemplate, 'custom'>, ColumnMapping> = {
  yayoi: {
    date: 0,
    description: 6,
    debit_account: 2,
    debit_amount: 3,
    credit_account: 4,
    credit_amount: 5,
  },
  freee: {
    date: 0,
    description: 5,
    debit_account: 1,
    debit_amount: 3,
    credit_account: 1, // freee uses single account + direction
    credit_amount: 3,
    tax_code: 2,
  },
  moneyforward: {
    date: 0,
    description: 7,
    debit_account: 1,
    debit_amount: 3,
    credit_account: 4,
    credit_amount: 6,
  },
};

/**
 * Parse accounting CSV with template or custom column mapping.
 */
export function parseAccountingCsv(
  content: string,
  template: AccountingCsvTemplate,
  customMapping?: ColumnMapping
): AccountingCsvParseResult {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [], headers: [], preview: [], errors: ['CSVにデータ行がありません'] };
  }

  const headers = parseCsvLine(lines[0]);

  // Generate preview (first 20 data rows)
  const preview = lines.slice(1, 21).map(parseCsvLine);

  const mapping = template === 'custom'
    ? customMapping
    : TEMPLATE_MAPPINGS[template];

  if (!mapping) {
    return { rows: [], headers, preview, errors: ['列マッピングが指定されていません'] };
  }

  const errors: string[] = [];
  const rows: ParsedJournalRow[] = [];

  // Special handling for freee format (single-entry style)
  const isFreee = template === 'freee';

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 3) continue;

    const rawDate = fields[mapping.date]?.trim();
    const date = parseDate(rawDate);
    if (!date) {
      if (rawDate) errors.push(`行${i + 1}: 日付の解析に失敗: ${rawDate}`);
      continue;
    }

    const description = fields[mapping.description]?.trim() || '';

    if (isFreee) {
      // freee format: single line with account + amount + direction (収支区分 column 6)
      // freee uses a single-entry style; we generate the counter-account as a default settlement account.
      const accountCode = fields[mapping.debit_account]?.trim() || '';
      const amount = parseNumber(fields[mapping.debit_amount]);
      const taxCode = mapping.tax_code !== undefined ? fields[mapping.tax_code]?.trim() || null : null;
      const direction = fields[6]?.trim(); // 収支区分: 収入 or 支出
      // freee column 4 is the settlement account (決済口座); fallback to generic cash account
      const settlementAccount = fields[4]?.trim() || 'CASH';

      if (amount === null || !accountCode) continue;

      if (direction === '支出' || direction === '出金') {
        rows.push({
          date,
          description,
          debit_account_code: accountCode,
          debit_amount: amount,
          credit_account_code: settlementAccount,
          credit_amount: amount,
          tax_code: normalizeTaxCode(taxCode),
        });
      } else {
        rows.push({
          date,
          description,
          debit_account_code: settlementAccount,
          debit_amount: amount,
          credit_account_code: accountCode,
          credit_amount: amount,
          tax_code: normalizeTaxCode(taxCode),
        });
      }
    } else {
      // Standard double-entry format (yayoi, moneyforward, custom)
      const debitAccount = fields[mapping.debit_account]?.trim() || '';
      const creditAccount = fields[mapping.credit_account]?.trim() || '';
      const debitAmount = parseNumber(fields[mapping.debit_amount]);
      const creditAmount = parseNumber(fields[mapping.credit_amount]);
      const taxCode = mapping.tax_code !== undefined ? fields[mapping.tax_code]?.trim() || null : null;

      if (debitAmount === null && creditAmount === null) {
        errors.push(`行${i + 1}: 金額の解析に失敗`);
        continue;
      }

      rows.push({
        date,
        description,
        debit_account_code: debitAccount,
        debit_amount: debitAmount ?? 0,
        credit_account_code: creditAccount,
        credit_amount: creditAmount ?? 0,
        tax_code: normalizeTaxCode(taxCode),
      });
    }
  }

  return { rows, headers, preview, errors };
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  let m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[¥￥,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

function normalizeTaxCode(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[\s\u3000]/g, '');

  // 10% tax patterns
  if (lower.includes('10%') || lower === 'tax10' || lower.includes('課税10')
    || lower.includes('課対仕入10') || lower.includes('課税売上10')
    || lower.includes('課対売上10') || lower.includes('標準税率')) return 'TAX10';

  // 8% reduced rate patterns
  if (lower.includes('8%') || lower === 'tax8' || lower.includes('軽減8')
    || lower.includes('軽減税率') || lower.includes('課対仕入8')
    || lower.includes('課税売上8') || lower.includes('課対売上8')) return 'TAX8';

  // Non-taxable
  if (lower.includes('非課税') || lower === 'nontax' || lower.includes('対象外')) return 'NONTAX';

  // Exempt (export, etc.)
  if (lower.includes('免税') || lower === 'exempt' || lower.includes('輸出免税')) return 'EXEMPT';

  // Unrecognized — return as-is
  return raw;
}
