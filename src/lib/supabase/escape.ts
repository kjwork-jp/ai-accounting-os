/**
 * Escape special characters for PostgREST ilike/like filters.
 * Prevents user input from being interpreted as wildcards.
 */
export function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Escape special characters for PostgREST .or() filter strings.
 * Prevents filter injection via commas, dots, and parentheses.
 */
export function escapeFilterValue(value: string): string {
  return escapeIlike(value).replace(/[,.()"']/g, '');
}
