/**
 * Partner name matching / deduplication logic.
 * Uses Levenshtein distance with Japanese business name normalization.
 * See WBS 3.5.2 名寄せ簡易 / ACC-017 取引先名寄せ.
 */

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Normalize a Japanese business name for comparison.
 * - Convert katakana to hiragana
 * - Normalize company suffixes (株式会社, (株), ㈱, etc.)
 * - Remove whitespace and common punctuation
 * - Lowercase ASCII
 */
export function normalizeBusinessName(name: string): string {
  let normalized = name;

  // Katakana → Hiragana (Unicode range shift: 0x30A0 → 0x3040)
  normalized = normalized.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );

  // Normalize company suffixes
  const suffixPatterns = [
    /株式会社/g,
    /有限会社/g,
    /合同会社/g,
    /合名会社/g,
    /合資会社/g,
    /\(株\)/g,
    /（株）/g,
    /㈱/g,
    /\(有\)/g,
    /（有）/g,
    /㈲/g,
    /\(合\)/g,
    /（合）/g,
  ];
  for (const pattern of suffixPatterns) {
    normalized = normalized.replace(pattern, '');
  }

  // Remove whitespace (full-width and half-width)
  normalized = normalized.replace(/[\s\u3000]+/g, '');

  // Normalize full-width ASCII to half-width
  normalized = normalized.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );

  // Lowercase ASCII
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * Compute similarity between two business names (0-1).
 * 1.0 = exact match, 0.0 = completely different.
 */
export function computeNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeBusinessName(name1);
  const n2 = normalizeBusinessName(name2);

  if (n1 === n2) return 1.0;
  if (n1.length === 0 || n2.length === 0) return 0.0;

  const distance = levenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);

  return 1 - distance / maxLen;
}

export interface DuplicateCandidate {
  partner_id: string;
  partner_name: string;
  match_partner_id: string;
  match_partner_name: string;
  similarity: number;
}

/**
 * Find duplicate partner candidates within a list.
 * Returns pairs with similarity >= threshold, sorted by similarity desc.
 */
export function findDuplicates(
  partners: { id: string; name: string }[],
  threshold = 0.8
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  for (let i = 0; i < partners.length; i++) {
    for (let j = i + 1; j < partners.length; j++) {
      const similarity = computeNameSimilarity(partners[i].name, partners[j].name);
      if (similarity >= threshold) {
        candidates.push({
          partner_id: partners[i].id,
          partner_name: partners[i].name,
          match_partner_id: partners[j].id,
          match_partner_name: partners[j].name,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find similar partners for a given name from a list.
 * Used when creating a new partner to warn about potential duplicates.
 */
export function findSimilarPartners(
  name: string,
  existingPartners: { id: string; name: string }[],
  threshold = 0.8
): { id: string; name: string; similarity: number }[] {
  return existingPartners
    .map((p) => ({
      id: p.id,
      name: p.name,
      similarity: computeNameSimilarity(name, p.name),
    }))
    .filter((p) => p.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .map((p) => ({ ...p, similarity: Math.round(p.similarity * 100) / 100 }));
}
