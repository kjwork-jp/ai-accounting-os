import { z } from 'zod';

// ============================================
// DocumentTypeCode — 単一ソース定義
// DB (m_document_types) / TS / Zod / UI で共通利用
// ============================================

/** 全ドキュメント種別（DB m_document_types と一致） */
export const DOCUMENT_TYPE_CODES = [
  'invoice',
  'receipt',
  'quotation',
  'contract',
  'bank_statement',
  'credit_card',
  'other',
] as const;

/** OCR分類で出力可能な種別（PDF/画像のみ。CSV系は含まない） */
export const OCR_CLASSIFIABLE_TYPES = [
  'invoice',
  'receipt',
  'quotation',
  'contract',
  'other',
] as const;

export const documentTypeCodeSchema = z.enum(DOCUMENT_TYPE_CODES);
export const ocrClassifiableTypeSchema = z.enum(OCR_CLASSIFIABLE_TYPES);

// ============================================
// DocumentStatus — 単一ソース定義
// 状態遷移:
//   uploaded → queued → processing → extracted → verified
//                                       ↓
//   error ←────────────────────────────┘
//     ↓
//   queued（retry）
// ============================================

export const DOCUMENT_STATUSES = [
  'uploaded',
  'queued',
  'processing',
  'extracted',
  'verified',
  'error',
] as const;

export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

/** enqueue-parse / retry が受け入れる前提status */
export const ENQUEUEABLE_STATUSES = ['uploaded', 'queued', 'error'] as const;

// ============================================
// API クエリパラメータ
// ============================================

export const documentsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  status: documentStatusSchema.optional(),
  document_type: documentTypeCodeSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_min: z.coerce.number().min(0).optional(),
  amount_max: z.coerce.number().min(0).optional(),
  q: z.string().max(200).optional(),
  sort_by: z.enum(['created_at', 'document_date', 'amount']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type DocumentsListQuery = z.infer<typeof documentsListQuerySchema>;
