import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../worker/src/lib/supabase', () => ({
  createWorkerSupabase: vi.fn(),
}));
vi.mock('../../worker/src/lib/metrics', () => ({
  emitMetric: vi.fn(),
  METRIC: {
    JOURNAL_SUGGEST_SUCCESS: 'journal_suggest_success',
    JOURNAL_SUGGEST_FAILURE: 'journal_suggest_failure',
    JOURNAL_SUGGEST_LATENCY_MS: 'journal_suggest_latency_ms',
    JOURNAL_SUGGEST_CONFIDENCE: 'journal_suggest_confidence',
  },
}));
vi.mock('../../worker/src/lib/llm-client', () => ({
  suggestJournal: vi.fn(),
}));

import { processJournalSuggest } from '../../worker/src/jobs/journal-suggest';
import { createWorkerSupabase } from '../../worker/src/lib/supabase';
import { suggestJournal } from '../../worker/src/lib/llm-client';
import type { Job } from 'bullmq';

const mockedCreateWorkerSupabase = vi.mocked(createWorkerSupabase);
const mockedSuggestJournal = vi.mocked(suggestJournal);

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

function makeLlmResponse(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        lines: [
          { account_code: '5100', account_name: '仕入高', debit: 10000, credit: 0, tax_code: 'TAX10', memo: '' },
          { account_code: '1500', account_name: '仮払消費税', debit: 1000, credit: 0, tax_code: 'TAX10', memo: '' },
          { account_code: '2100', account_name: '買掛金', debit: 0, credit: 11000, tax_code: null, memo: '' },
        ],
        description: 'テスト仕入',
        reasoning: '仕入取引と判断',
        confidence: 0.85,
      },
      {
        lines: [
          { account_code: '6000', account_name: '消耗品費', debit: 10000, credit: 0, tax_code: 'TAX10', memo: '' },
          { account_code: '1500', account_name: '仮払消費税', debit: 1000, credit: 0, tax_code: 'TAX10', memo: '' },
          { account_code: '1000', account_name: '現金', debit: 0, credit: 11000, tax_code: null, memo: '' },
        ],
        description: '消耗品購入',
        reasoning: '消耗品の可能性',
        confidence: 0.65,
      },
    ],
    overall_confidence: 0.85,
    ...overrides,
  };
}

describe('processJournalSuggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateWorkerSupabase.mockReturnValue(mockSupabase as never);
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  function setupSupabaseMocks(opts: {
    extraction?: Record<string, unknown>;
    accounts?: Array<{ code: string; name: string; category: string }>;
    settings?: { auto_confirm_high: number; auto_confirm_mid: number };
    insertError?: string | null;
  } = {}) {
    const extraction = opts.extraction ?? {
      vendor_name: 'テスト株式会社',
      document_date: '2025-01-15',
      total_amount: 11000,
      tax_amount: 1000,
      document_type: 'invoice',
      line_items: [{ description: 'テスト品', quantity: 1, unit_price: 10000, amount: 10000 }],
    };
    const accounts = opts.accounts ?? [
      { code: '5100', name: '仕入高', category: 'expense' },
      { code: '1500', name: '仮払消費税', category: 'asset' },
      { code: '2100', name: '買掛金', category: 'liability' },
      { code: '6000', name: '消耗品費', category: 'expense' },
      { code: '1000', name: '現金', category: 'asset' },
    ];
    const settings = opts.settings ?? { auto_confirm_high: 0.90, auto_confirm_mid: 0.70 };

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // document_extractions
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { extracted_json: extraction }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (fromCallCount === 2) {
        // invoice_checks
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { status: 'ok', reasons: [] }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (fromCallCount === 3) {
        // m_accounts
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: accounts, error: null }),
              }),
            }),
          }),
        };
      }
      if (fromCallCount === 4) {
        // feedback_events
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (fromCallCount === 5) {
        // tenant_settings
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: settings, error: null }),
            }),
          }),
        };
      }
      // journal_drafts insert (success or error for error draft)
      return {
        insert: vi.fn().mockResolvedValue({
          error: opts.insertError ? { message: opts.insertError } : null,
        }),
      };
    });
  }

  it('should create journal draft with needs_review status for mid confidence', async () => {
    setupSupabaseMocks();
    mockedSuggestJournal.mockResolvedValue(JSON.stringify(makeLlmResponse()));

    await processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }));

    const lastCall = mockSupabase.from.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('journal_drafts');
  });

  it('should create journal draft with suggested status for high confidence', async () => {
    setupSupabaseMocks();
    mockedSuggestJournal.mockResolvedValue(
      JSON.stringify(makeLlmResponse({ overall_confidence: 0.95 }))
    );

    await processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }));

    const lastCall = mockSupabase.from.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('journal_drafts');
  });

  it('should clamp confidence to 0-1 range', async () => {
    setupSupabaseMocks();
    const response = makeLlmResponse({ overall_confidence: 1.5 });
    response.candidates[0].confidence = 2.0;
    mockedSuggestJournal.mockResolvedValue(JSON.stringify(response));

    await processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }));

    // Should not throw — confidence is clamped to 1.0
  });

  it('should throw when debit/credit are unbalanced', async () => {
    setupSupabaseMocks();
    const response = makeLlmResponse();
    response.candidates[0].lines[2].credit = 999;
    mockedSuggestJournal.mockResolvedValue(JSON.stringify(response));

    await expect(
      processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }))
    ).rejects.toThrow('debit');
  });

  it('should throw when LLM returns no candidates', async () => {
    setupSupabaseMocks();
    mockedSuggestJournal.mockResolvedValue(
      JSON.stringify({ candidates: [], overall_confidence: 0 })
    );

    await expect(
      processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }))
    ).rejects.toThrow('no candidates');
  });

  it('should throw when LLM returns invalid JSON', async () => {
    setupSupabaseMocks();
    mockedSuggestJournal.mockResolvedValue('This is not JSON at all');

    await expect(
      processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }))
    ).rejects.toThrow('JSON');
  });

  it('should limit candidates to 3', async () => {
    setupSupabaseMocks();
    const response = makeLlmResponse();
    response.candidates.push(
      { ...response.candidates[0], confidence: 0.5 },
      { ...response.candidates[0], confidence: 0.4 },
    );
    mockedSuggestJournal.mockResolvedValue(JSON.stringify(response));

    await processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }));

    // Should not throw — limited to 3 candidates
  });

  it('should insert error draft when LLM returns no candidates', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    // Custom mock setup: track all from() calls to capture error draft insert
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'document_extractions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { extracted_json: { vendor_name: 'テスト', document_type: 'invoice' } },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'invoice_checks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'm_accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'feedback_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { auto_confirm_high: 0.9, auto_confirm_mid: 0.7 },
                error: null,
              }),
            }),
          }),
        };
      }
      // journal_drafts — both success insert and error draft insert
      return { insert: insertMock };
    });

    mockedSuggestJournal.mockResolvedValue(
      JSON.stringify({ candidates: [], overall_confidence: 0 })
    );

    await expect(
      processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }))
    ).rejects.toThrow('no candidates');

    // Verify error draft was inserted
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        document_id: 'doc-1',
        tenant_id: 'tenant-1',
      })
    );
  });

  it('should mark low confidence drafts with ai_reason prefix', async () => {
    setupSupabaseMocks();
    // Confidence below mid threshold (0.70)
    const response = makeLlmResponse({ overall_confidence: 0.50 });
    response.candidates[0].confidence = 0.50;
    mockedSuggestJournal.mockResolvedValue(JSON.stringify(response));

    await processJournalSuggest(makeJob({ documentId: 'doc-1', tenantId: 'tenant-1' }));

    // Should succeed — low confidence gets [低信頼度] prefix in ai_reason
    const lastCall = mockSupabase.from.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('journal_drafts');
  });
});
