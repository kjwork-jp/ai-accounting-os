/**
 * Bank / Credit Card CSV parser.
 * Supports multiple Japanese bank formats and auto-detection.
 * Handles Shift_JIS encoding.
 * See WBS 3.4.1 銀行CSV取込 / ACC-002.
 */

import { parseCsvLine, extractCounterpartyName } from './csv-utils';

export interface ParsedPaymentRow {
  occurred_on: string; // YYYY-MM-DD
  description: string;
  amount: number;
  direction: 'in' | 'out';
  balance?: number;
  counterparty_name_raw: string;
}

export interface CsvParseResult {
  rows: ParsedPaymentRow[];
  format_detected: string;
  errors: string[];
}

/**
 * Parse bank CSV content.
 * Auto-detects format from header row.
 */
export function parseBankCsv(content: string): CsvParseResult {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [], format_detected: 'unknown', errors: ['CSVにデータ行がありません'] };
  }

  const header = lines[0];
  const errors: string[] = [];

  // Auto-detect format from header
  if (header.includes('日付') && header.includes('摘要') && (header.includes('出金') || header.includes('お支払い'))) {
    return parseGenericBankFormat(lines, errors);
  }
  if (header.includes('取引日') || header.includes('利用日')) {
    return parseGenericBankFormat(lines, errors);
  }

  // Fallback: try generic CSV (date, description, withdrawal, deposit, balance)
  return parseGenericBankFormat(lines, errors);
}

/**
 * Parse credit card CSV content.
 */
export function parseCreditCardCsv(content: string): CsvParseResult {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [], format_detected: 'unknown', errors: ['CSVにデータ行がありません'] };
  }

  const errors: string[] = [];
  const rows: ParsedPaymentRow[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 3) continue;

    const date = parseJapaneseDate(fields[0].trim());
    if (!date) {
      errors.push(`行${i + 1}: 日付の解析に失敗: ${fields[0]}`);
      continue;
    }

    const description = fields[1].trim();
    const amount = parseAmount(fields[2]);
    if (amount === null) {
      errors.push(`行${i + 1}: 金額の解析に失敗: ${fields[2]}`);
      continue;
    }

    rows.push({
      occurred_on: date,
      description,
      amount: Math.abs(amount),
      direction: 'out', // Credit card is always outgoing
      counterparty_name_raw: extractCounterpartyName(description),
    });
  }

  return { rows, format_detected: 'credit_card', errors };
}

function parseGenericBankFormat(lines: string[], errors: string[]): CsvParseResult {
  const headerFields = parseCsvLine(lines[0]).map((f) => f.trim());

  // Find column indices
  const dateIdx = headerFields.findIndex((h) =>
    /日付|取引日|利用日/.test(h)
  );
  const descIdx = headerFields.findIndex((h) =>
    /摘要|内容|適用|備考/.test(h)
  );
  const withdrawalIdx = headerFields.findIndex((h) =>
    /出金|お支払い|引出|支出/.test(h)
  );
  const depositIdx = headerFields.findIndex((h) =>
    /入金|お預入|預入|収入/.test(h)
  );
  const balanceIdx = headerFields.findIndex((h) =>
    /残高|差引残高/.test(h)
  );
  // Some formats have a single amount column
  const amountIdx = headerFields.findIndex((h) =>
    /金額/.test(h) && !/残/.test(h)
  );

  const useSingleAmount = withdrawalIdx === -1 && depositIdx === -1 && amountIdx !== -1;

  const rows: ParsedPaymentRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 2) continue;

    const rawDate = fields[dateIdx >= 0 ? dateIdx : 0]?.trim();
    const date = parseJapaneseDate(rawDate);
    if (!date) {
      if (rawDate) errors.push(`行${i + 1}: 日付の解析に失敗: ${rawDate}`);
      continue;
    }

    const description = fields[descIdx >= 0 ? descIdx : 1]?.trim() || '';

    let amount: number;
    let direction: 'in' | 'out';

    if (useSingleAmount) {
      const val = parseAmount(fields[amountIdx]);
      if (val === null) continue;
      amount = Math.abs(val);
      direction = val >= 0 ? 'in' : 'out';
    } else {
      const withdrawal = parseAmount(fields[withdrawalIdx >= 0 ? withdrawalIdx : 2]) ?? 0;
      const deposit = parseAmount(fields[depositIdx >= 0 ? depositIdx : 3]) ?? 0;

      if (withdrawal > 0) {
        amount = withdrawal;
        direction = 'out';
      } else if (deposit > 0) {
        amount = deposit;
        direction = 'in';
      } else {
        continue; // Skip zero-amount rows
      }
    }

    const balance = balanceIdx >= 0 ? parseAmount(fields[balanceIdx]) ?? undefined : undefined;

    rows.push({
      occurred_on: date,
      description,
      amount,
      direction,
      balance,
      counterparty_name_raw: extractCounterpartyName(description),
    });
  }

  return { rows, format_detected: 'bank_generic', errors };
}

/** Parse various Japanese date formats to YYYY-MM-DD. */
function parseJapaneseDate(raw: string): string | null {
  if (!raw) return null;

  // YYYY/MM/DD or YYYY-MM-DD
  let m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  // YYYYMMDD
  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  // MM/DD/YYYY (rare but possible)
  m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  return null;
}

/** Parse amount string removing commas and currency symbols. */
function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[¥￥,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}
