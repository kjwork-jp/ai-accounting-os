/**
 * Shared CSV parsing utilities.
 */

/** Parse a single CSV line respecting quoted fields. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Extract counterparty name from a bank transaction description.
 * Removes common Japanese bank prefixes (振込, 入金, 出金, etc.)
 * and suffixes to get the actual counterparty name.
 */
export function extractCounterpartyName(description: string): string {
  let name = description.trim();

  // Remove common transaction type prefixes
  const prefixes = [
    /^振込\s*/,
    /^振替\s*/,
    /^入金\s*/,
    /^出金\s*/,
    /^引落\s*/,
    /^口座振替\s*/,
    /^カ[）\)]\s*/,   // カ) — common in bank statements for transfer
    /^ﾌﾘｺﾐ\s*/,       // half-width katakana
    /^ﾆﾕｳｷﾝ\s*/,
    /^ｼﾕﾂｷﾝ\s*/,
    /^ATM\s*/i,
    /^ＡＴＭ\s*/,
  ];

  for (const prefix of prefixes) {
    name = name.replace(prefix, '');
  }

  // Remove trailing date/reference patterns like " 0227" or " ﾃﾞﾝ123"
  name = name.replace(/\s+\d{4,}$/, '');
  name = name.replace(/\s+ﾃﾞﾝ\d+$/, '');

  return name.trim() || description.trim();
}
