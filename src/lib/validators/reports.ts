import { z } from 'zod';

/**
 * Zod schemas for report APIs (trial balance, tax summary).
 * See 技術設計書 04_API設計詳細 — reports endpoints.
 */

// GET /reports/trial-balance query params
export const trialBalanceQuerySchema = z.object({
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  comparison: z.coerce.boolean().default(false),
});

// GET /reports/tax-summary query params
export const taxSummaryQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET /journals/export query params
export const journalExportQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['standard', 'yayoi']).default('standard'),
});

export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;
export type TaxSummaryQuery = z.infer<typeof taxSummaryQuerySchema>;
export type JournalExportQuery = z.infer<typeof journalExportQuerySchema>;
