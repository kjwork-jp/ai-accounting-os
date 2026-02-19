import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDuplicates } from '../../worker/src/jobs/duplicate-check';
import type { SupabaseClient } from '@supabase/supabase-js';

// Chainable mock shape
interface MockChain {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

// Helper: build a chainable mock Supabase client
function createMockSupabase(resolvedValue: { data: unknown[] | null; error: unknown | null }): {
  client: SupabaseClient;
  chain: MockChain;
} {
  const chain: MockChain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolvedValue),
  };
  return { client: chain as unknown as SupabaseClient, chain };
}

const baseInput = {
  documentId: 'doc-1',
  tenantId: 'tenant-1',
  documentDate: '2025-06-15',
  amount: 10000,
};

describe('checkDuplicates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty when documentDate is null', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    const result = await checkDuplicates({ ...baseInput, documentDate: null }, client);
    expect(result.suspects).toEqual([]);
    expect(chain.from).not.toHaveBeenCalled();
  });

  it('returns empty when amount is null', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    const result = await checkDuplicates({ ...baseInput, amount: null }, client);
    expect(result.suspects).toEqual([]);
    expect(chain.from).not.toHaveBeenCalled();
  });

  it('returns empty when no matches', async () => {
    const { client } = createMockSupabase({ data: [], error: null });
    const result = await checkDuplicates(baseInput, client);
    expect(result.suspects).toEqual([]);
  });

  it('returns 2 suspects when 2 matches found', async () => {
    const { client } = createMockSupabase({
      data: [
        { id: 'doc-2', file_name: 'invoice-a.pdf' },
        { id: 'doc-3', file_name: 'invoice-b.pdf' },
      ],
      error: null,
    });
    const result = await checkDuplicates(baseInput, client);
    expect(result.suspects).toHaveLength(2);
    expect(result.suspects[0]).toEqual({
      document_id: 'doc-2',
      file_name: 'invoice-a.pdf',
      match_reason: 'date_amount',
    });
    expect(result.suspects[1]).toEqual({
      document_id: 'doc-3',
      file_name: 'invoice-b.pdf',
      match_reason: 'date_amount',
    });
  });

  it('excludes self via neq(id)', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    await checkDuplicates(baseInput, client);
    expect(chain.neq).toHaveBeenCalledWith('id', 'doc-1');
  });

  it('calculates ±3 day window correctly', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    await checkDuplicates({ ...baseInput, documentDate: '2025-06-15' }, client);
    expect(chain.gte).toHaveBeenCalledWith('document_date', '2025-06-12');
    expect(chain.lte).toHaveBeenCalledWith('document_date', '2025-06-18');
  });

  it('handles month boundary (2025-01-02 → dateFrom=2024-12-30)', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    await checkDuplicates({ ...baseInput, documentDate: '2025-01-02' }, client);
    expect(chain.gte).toHaveBeenCalledWith('document_date', '2024-12-30');
    expect(chain.lte).toHaveBeenCalledWith('document_date', '2025-01-05');
  });

  it('handles year boundary (2025-01-01 → dateFrom=2024-12-29)', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    await checkDuplicates({ ...baseInput, documentDate: '2025-01-01' }, client);
    expect(chain.gte).toHaveBeenCalledWith('document_date', '2024-12-29');
    expect(chain.lte).toHaveBeenCalledWith('document_date', '2025-01-04');
  });

  it('calls limit(10)', async () => {
    const { client, chain } = createMockSupabase({ data: [], error: null });
    await checkDuplicates(baseInput, client);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('throws on query error', async () => {
    const { client } = createMockSupabase({ data: null, error: { message: 'DB error' } });
    await expect(checkDuplicates(baseInput, client)).rejects.toThrow('Duplicate check query failed: DB error');
  });
});
