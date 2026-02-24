import { z } from 'zod';

/**
 * Zod schemas for accounting CSV import API.
 * See WBS 3.7 既存会計CSV取込 / ACC-004 (D-2 逸脱: 手動マッピング).
 */

export const accountingCsvTemplates = ['yayoi', 'freee', 'moneyforward', 'custom'] as const;

// Column mapping for custom template
export const columnMappingSchema = z.object({
  date: z.number().int().min(0),
  description: z.number().int().min(0),
  debit_account: z.number().int().min(0),
  debit_amount: z.number().int().min(0),
  credit_account: z.number().int().min(0),
  credit_amount: z.number().int().min(0),
  tax_code: z.number().int().min(0).optional(),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;
export type AccountingCsvTemplate = (typeof accountingCsvTemplates)[number];
