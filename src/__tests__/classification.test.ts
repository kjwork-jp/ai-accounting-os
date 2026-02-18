import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client before importing classification module
vi.mock('../../worker/src/lib/llm-client', () => ({
  classifyDocument: vi.fn(),
}));

import { classifyExtraction } from '../../worker/src/jobs/classification';
import { classifyDocument } from '../../worker/src/lib/llm-client';
import type { StructuredExtraction } from '../../worker/src/jobs/structuring';
import type { DiModelId } from '../../worker/src/lib/di-client';

const mockedClassifyDocument = vi.mocked(classifyDocument);

function makeStructured(overrides: Partial<StructuredExtraction> = {}): StructuredExtraction {
  return {
    vendor_name: 'テスト株式会社',
    vendor_address: null,
    vendor_registration_number: null,
    customer_name: null,
    document_date: '2025-01-15',
    due_date: null,
    invoice_number: null,
    subtotal: null,
    tax_amount: null,
    total_amount: 10000,
    tax_details: [],
    line_items: [],
    raw_text: 'サンプルテキスト',
    confidence: 0.9,
    ...overrides,
  };
}

describe('classifyExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rule-based classification', () => {
    it('should classify as invoice when prebuilt-invoice with high confidence', async () => {
      const result = await classifyExtraction(
        makeStructured({ confidence: 0.9 }),
        'prebuilt-invoice' as DiModelId,
        'invoice.pdf'
      );

      expect(result.documentType).toBe('invoice');
      expect(result.method).toBe('rule');
      expect(result.confidence).toBe(0.9);
      expect(mockedClassifyDocument).not.toHaveBeenCalled();
    });

    it('should fall through to LLM when prebuilt-invoice with low confidence', async () => {
      mockedClassifyDocument.mockResolvedValue({
        documentType: 'quotation',
        confidence: 0.8,
        reasoning: 'LLM classified as quotation',
      });

      const result = await classifyExtraction(
        makeStructured({ confidence: 0.5 }),
        'prebuilt-invoice' as DiModelId,
        'doc.pdf'
      );

      expect(result.documentType).toBe('quotation');
      expect(result.method).toBe('llm');
      expect(mockedClassifyDocument).toHaveBeenCalledOnce();
    });

    it('should fall through to LLM when prebuilt-read regardless of confidence', async () => {
      mockedClassifyDocument.mockResolvedValue({
        documentType: 'contract',
        confidence: 0.7,
        reasoning: 'Contract detected',
      });

      const result = await classifyExtraction(
        makeStructured({ confidence: 0.95 }),
        'prebuilt-read' as DiModelId,
        'doc.pdf'
      );

      // prebuilt-read doesn't trigger the invoice rule
      expect(result.method).toBe('llm');
      expect(mockedClassifyDocument).toHaveBeenCalledOnce();
    });

    it('should classify CSV files as other', async () => {
      const result = await classifyExtraction(
        makeStructured({ confidence: 0.3 }),
        'prebuilt-read' as DiModelId,
        'data.csv'
      );

      expect(result.documentType).toBe('other');
      expect(result.method).toBe('rule');
      expect(result.reasoning).toContain('CSV/XLSX');
      expect(mockedClassifyDocument).not.toHaveBeenCalled();
    });

    it('should classify as receipt when keyword found with sufficient confidence', async () => {
      const result = await classifyExtraction(
        makeStructured({
          raw_text: '領収書\nテスト株式会社\n金額: 5,000円',
          confidence: 0.7,
        }),
        'prebuilt-read' as DiModelId,
        'scan.jpg'
      );

      expect(result.documentType).toBe('receipt');
      expect(result.method).toBe('rule');
      expect(mockedClassifyDocument).not.toHaveBeenCalled();
    });

    it('should fall through to LLM when receipt keyword but low confidence', async () => {
      mockedClassifyDocument.mockResolvedValue({
        documentType: 'receipt',
        confidence: 0.6,
        reasoning: 'Receipt',
      });

      const result = await classifyExtraction(
        makeStructured({
          raw_text: '領収書\nテスト',
          confidence: 0.4,
        }),
        'prebuilt-read' as DiModelId,
        'scan.jpg'
      );

      expect(result.method).toBe('llm');
      expect(mockedClassifyDocument).toHaveBeenCalledOnce();
    });
  });

  describe('LLM fallback', () => {
    it('should use LLM result when valid type returned', async () => {
      mockedClassifyDocument.mockResolvedValue({
        documentType: 'quotation',
        confidence: 0.85,
        reasoning: 'Detected quotation format',
      });

      const result = await classifyExtraction(
        makeStructured({ confidence: 0.5 }),
        'prebuilt-invoice' as DiModelId,
        'doc.pdf'
      );

      expect(result.documentType).toBe('quotation');
      expect(result.confidence).toBe(0.85);
      expect(result.method).toBe('llm');
    });

    it('should default to other when LLM returns invalid type', async () => {
      mockedClassifyDocument.mockResolvedValue({
        documentType: 'bank_statement', // not in OCR_CLASSIFIABLE_TYPES
        confidence: 0.8,
        reasoning: 'Bank statement',
      });

      const result = await classifyExtraction(
        makeStructured({ confidence: 0.5 }),
        'prebuilt-invoice' as DiModelId,
        'doc.pdf'
      );

      expect(result.documentType).toBe('other');
      expect(result.method).toBe('llm');
    });

    it('should default to other with confidence 0 when LLM throws', async () => {
      mockedClassifyDocument.mockRejectedValue(new Error('API timeout'));

      const result = await classifyExtraction(
        makeStructured({ confidence: 0.5 }),
        'prebuilt-invoice' as DiModelId,
        'doc.pdf'
      );

      expect(result.documentType).toBe('other');
      expect(result.confidence).toBe(0.0);
      expect(result.method).toBe('llm');
      expect(result.reasoning).toContain('LLM call failed');
    });
  });
});
