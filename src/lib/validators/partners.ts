import { z } from 'zod';

/**
 * Zod schemas for partner management APIs.
 * See 技術設計書 04_API設計詳細 — partners endpoints.
 */

// GET /partners query params
export const partnersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  category: z.enum(['customer', 'supplier', 'both']).optional(),
  is_active: z.coerce.boolean().optional(),
});

// POST /partners request body
export const partnerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  name_kana: z.string().max(200).nullable().optional(),
  registration_number: z.string().max(20).nullable().optional(),
  category: z.enum(['customer', 'supplier', 'both']),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  bank_info: z.string().max(500).nullable().optional(),
});

// PATCH /partners/:id request body
export const partnerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  name_kana: z.string().max(200).nullable().optional(),
  registration_number: z.string().max(20).nullable().optional(),
  category: z.enum(['customer', 'supplier', 'both']).optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  bank_info: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  updated_at: z.string().datetime(), // optimistic lock
});

// POST /partners/:id/merge request body
export const partnerMergeSchema = z.object({
  merge_from_ids: z.array(z.string().uuid()).min(1).max(20),
});

export type PartnersQuery = z.infer<typeof partnersQuerySchema>;
export type PartnerCreateRequest = z.infer<typeof partnerCreateSchema>;
export type PartnerUpdateRequest = z.infer<typeof partnerUpdateSchema>;
export type PartnerMergeRequest = z.infer<typeof partnerMergeSchema>;
