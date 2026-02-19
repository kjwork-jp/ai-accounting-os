import { z } from 'zod';

/**
 * Zod schemas for journal draft/entry APIs.
 * See 技術設計書 04_API設計詳細 + plan-wbs3.2 §2/§11.
 */

// GET /journals/drafts query params
export const journalDraftsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['suggested', 'needs_review', 'confirmed', 'error']).optional(),
  document_id: z.string().uuid().optional(),
});

// GET /journals/entries query params
export const journalEntriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'confirmed', 'reversed']).optional(),
  source_type: z.enum(['document', 'order', 'invoice', 'manual']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /journals/drafts/:id/confirm request body
export const journalConfirmSchema = z.object({
  selectedIndex: z.number().int().min(0).max(2),
  overrideReason: z.string().max(500).optional(),
  overrideLines: z.array(z.object({
    account_code: z.string().min(1),
    account_name: z.string().min(1),
    debit: z.number().min(0),
    credit: z.number().min(0),
    tax_code: z.enum(['TAX10', 'TAX8', 'NONTAX', 'EXEMPT']).nullable(),
    partner_id: z.string().uuid().nullable().optional(),
    department: z.string().max(100).nullable().optional(),
    memo: z.string().max(500).default(''),
  })).optional(),
  overrideDescription: z.string().max(500).optional(),
});

export type JournalDraftsQuery = z.infer<typeof journalDraftsQuerySchema>;
export type JournalEntriesQuery = z.infer<typeof journalEntriesQuerySchema>;
export type JournalConfirmRequest = z.infer<typeof journalConfirmSchema>;
