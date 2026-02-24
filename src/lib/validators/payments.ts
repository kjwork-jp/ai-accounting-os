import { z } from 'zod';

/**
 * Zod schemas for payment import and reconciliation APIs.
 * See 技術設計書 04_API設計詳細 — payments/reconciliations endpoints.
 */

// POST /reconciliations/suggest request body
export const reconciliationSuggestSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ReconciliationSuggestRequest = z.infer<typeof reconciliationSuggestSchema>;
