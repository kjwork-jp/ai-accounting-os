import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase and metrics before importing
vi.mock('../../worker/src/lib/supabase', () => ({
  createWorkerSupabase: vi.fn(),
}));
vi.mock('../../worker/src/lib/metrics', () => ({
  emitMetric: vi.fn(),
  METRIC: {
    INVOICE_VALIDATE_SUCCESS: 'invoice_validate_success',
    INVOICE_VALIDATE_FAILURE: 'invoice_validate_failure',
  },
}));
vi.mock('../../worker/src/lib/enqueue-light', () => ({
  enqueueJournalSuggest: vi.fn().mockResolvedValue('journal_suggest:test:123'),
}));

import { processInvoiceValidate } from '../../worker/src/jobs/invoice-validate';
import { createWorkerSupabase } from '../../worker/src/lib/supabase';
import { enqueueJournalSuggest } from '../../worker/src/lib/enqueue-light';
import type { Job } from 'bullmq';

const mockSupabase = {
  from: vi.fn(),
};

function makeJob(data: { documentId: string; tenantId: string }): Job {
  return {
    data,
    id: 'test-job-id',
    attemptsMade: 0,
  } as unknown as Job;
}

function makeExtractionData(overrides: Record<string, unknown> = {}) {
  return {
    vendor_name: 'テスト株式会社',
    vendor_registration_number: 'T1234567890123',
    document_date: '2025-01-15',
    line_items: [{ description: 'サービス料', quantity: 1, unit_price: 10000, amount: 10000 }],
    tax_details: [{ rate: 10, taxable_amount: 10000, tax_amount: 1000 }],
    tax_amount: 1000,
    total_amount: 11000,
    ...overrides,
  };
}

describe('processInvoiceValidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createWorkerSupabase as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);
  });

  function setupMocks(extractionData: Record<string, unknown>, insertResult = { id: 'check-1' }) {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { extracted_json: extractionData }, error: null }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
        }),
      }),
    };
    mockSupabase.from.mockReturnValue(selectChain);
    return selectChain;
  }

  it('should return ok when all invoice fields are present', async () => {
    setupMocks(makeExtractionData());

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('ok');
    expect(result.checkId).toBe('check-1');
    expect(enqueueJournalSuggest).toHaveBeenCalledWith({ documentId: 'doc-1', tenantId: 'tenant-1' });
  });

  it('should return ng when vendor_name is missing', async () => {
    setupMocks(makeExtractionData({ vendor_name: null }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('ng');
    // ng status should NOT enqueue journal_suggest
    expect(enqueueJournalSuggest).not.toHaveBeenCalled();
  });

  it('should return ng when document_date is missing', async () => {
    setupMocks(makeExtractionData({ document_date: null }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('ng');
  });

  it('should return ng when total_amount is missing', async () => {
    setupMocks(makeExtractionData({ total_amount: null }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('ng');
  });

  it('should return needs_review when registration_number is missing', async () => {
    setupMocks(makeExtractionData({ vendor_registration_number: null }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('needs_review');
    // needs_review should still enqueue journal_suggest
    expect(enqueueJournalSuggest).toHaveBeenCalled();
  });

  it('should return needs_review when registration_number format is invalid', async () => {
    setupMocks(makeExtractionData({ vendor_registration_number: 'ABC123' }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('needs_review');
  });

  it('should return needs_review when tax_details are empty', async () => {
    setupMocks(makeExtractionData({ tax_details: [] }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('needs_review');
  });

  it('should return needs_review when line_items descriptions are all empty', async () => {
    setupMocks(makeExtractionData({
      line_items: [{ description: '', quantity: 1, unit_price: 10000, amount: 10000 }],
    }));

    const result = await processInvoiceValidate(
      makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' })
    );

    expect(result.status).toBe('needs_review');
  });

  it('should throw when extraction is not found', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    mockSupabase.from.mockReturnValue(chain);

    await expect(
      processInvoiceValidate(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }))
    ).rejects.toThrow('Extraction not found');
  });
});
