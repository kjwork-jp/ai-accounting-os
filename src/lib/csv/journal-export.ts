/**
 * Journal entry CSV export logic.
 * Supports standard and yayoi (弥生会計) formats.
 * See WBS 3.3.4 CSVエクスポート / ACC-014.
 */

interface JournalLineForExport {
  entry_date: string;
  entry_id: string;
  description: string | null;
  line_no: number;
  account_code: string;
  account_name: string | null;
  debit: number;
  credit: number;
  tax_code: string | null;
  partner_name: string | null;
  department: string | null;
  memo: string | null;
}

/**
 * Generate standard journal CSV content.
 * Columns: 日付, 伝票番号, 行番号, 摘要, 勘定科目コード, 勘定科目名, 借方金額, 貸方金額, 税区分, 取引先, 部門, メモ
 */
export function generateStandardCsv(lines: JournalLineForExport[]): string {
  const headers = [
    '日付', '伝票番号', '行番号', '摘要', '勘定科目コード', '勘定科目名',
    '借方金額', '貸方金額', '税区分', '取引先', '部門', 'メモ',
  ];

  const rows = lines.map((line) => [
    line.entry_date,
    line.entry_id,
    String(line.line_no),
    escapeCsvField(line.description ?? ''),
    line.account_code,
    escapeCsvField(line.account_name ?? ''),
    String(line.debit),
    String(line.credit),
    line.tax_code ?? '',
    escapeCsvField(line.partner_name ?? ''),
    escapeCsvField(line.department ?? ''),
    escapeCsvField(line.memo ?? ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n') + '\r\n';
}

/**
 * Generate Yayoi (弥生会計) compatible CSV content.
 * Yayoi format: 日付, 伝票No, 借方勘定科目, 借方金額, 借方税区分, 貸方勘定科目, 貸方金額, 貸方税区分, 摘要
 * Note: Yayoi expects paired debit/credit lines per entry.
 */
export function generateYayoiCsv(lines: JournalLineForExport[]): string {
  const headers = [
    '日付', '伝票No', '借方勘定科目', '借方金額', '借方税区分',
    '貸方勘定科目', '貸方金額', '貸方税区分', '摘要',
  ];

  // Group lines by entry_id, then pair debit/credit lines
  const entriesMap = new Map<string, JournalLineForExport[]>();
  for (const line of lines) {
    const existing = entriesMap.get(line.entry_id) ?? [];
    existing.push(line);
    entriesMap.set(line.entry_id, existing);
  }

  const rows: string[][] = [];
  for (const [, entryLines] of entriesMap) {
    const debits = entryLines.filter((l) => l.debit > 0);
    const credits = entryLines.filter((l) => l.credit > 0);
    const maxLen = Math.max(debits.length, credits.length);

    for (let i = 0; i < maxLen; i++) {
      const d = debits[i];
      const c = credits[i];
      const firstLine = entryLines[0];
      rows.push([
        firstLine.entry_date,
        firstLine.entry_id.slice(0, 8),
        d ? escapeCsvField(d.account_name ?? d.account_code) : '',
        d ? String(d.debit) : '',
        d?.tax_code ?? '',
        c ? escapeCsvField(c.account_name ?? c.account_code) : '',
        c ? String(c.credit) : '',
        c?.tax_code ?? '',
        escapeCsvField(firstLine.description ?? ''),
      ]);
    }
  }

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n') + '\r\n';
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
