import type { StructuredExtraction } from './structuring';
import type { DiModelId } from '../lib/di-client';
import { classifyDocument } from '../lib/llm-client';

/**
 * OCR classifiable document types (excludes bank_statement/credit_card which are CSV-only).
 * SYNC: src/lib/validators/documents.ts:20 — keep values in sync when modifying.
 */
const OCR_CLASSIFIABLE_TYPES = [
  'invoice', 'receipt', 'quotation', 'contract', 'other',
] as const;

const RULE_CONFIDENCE_THRESHOLD = 0.8;
const RECEIPT_CONFIDENCE_THRESHOLD = 0.6;

export interface ClassificationResult {
  documentType: string;
  confidence: number;
  method: 'rule' | 'llm';
  reasoning: string;
}

/**
 * 2-stage document classification:
 *   Stage 1: Rule-based (fast, free)
 *   Stage 2: LLM fallback (Claude API)
 */
export async function classifyExtraction(
  structured: StructuredExtraction,
  modelId: DiModelId,
  fileName: string
): Promise<ClassificationResult> {
  // Stage 1: Rule-based classification
  const ruleResult = applyRules(structured, modelId, fileName);
  if (ruleResult) return ruleResult;

  // Stage 2: LLM fallback
  return classifyWithLlm(structured, fileName);
}

function applyRules(
  structured: StructuredExtraction,
  modelId: DiModelId,
  fileName: string
): ClassificationResult | null {
  // Rule 1: prebuilt-invoice with high confidence → invoice
  if (modelId === 'prebuilt-invoice' && structured.confidence >= RULE_CONFIDENCE_THRESHOLD) {
    return {
      documentType: 'invoice',
      confidence: structured.confidence,
      method: 'rule',
      reasoning: `DI prebuilt-invoice confidence ${structured.confidence} >= ${RULE_CONFIDENCE_THRESHOLD}`,
    };
  }

  // Rule 2: CSV/XLSX files (safety check — normally classified at upload)
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.xlsx')) {
    return {
      documentType: 'other',
      confidence: 0.5,
      method: 'rule',
      reasoning: 'CSV/XLSX files classified via upload; unexpected in OCR pipeline',
    };
  }

  // Rule 3: Receipt keyword detection in raw_text header
  const receiptKeywords = ['領収書', '領収証', 'RECEIPT', 'レシート'];
  const textHeader = structured.raw_text.slice(0, 500);
  const hasReceiptKeyword = receiptKeywords.some((kw) => textHeader.includes(kw));
  if (hasReceiptKeyword && structured.confidence >= RECEIPT_CONFIDENCE_THRESHOLD) {
    return {
      documentType: 'receipt',
      confidence: Math.min(structured.confidence + 0.1, 1.0),
      method: 'rule',
      reasoning: `Receipt keyword detected in first 500 chars of raw_text`,
    };
  }

  return null; // No rule matched → LLM fallback
}

async function classifyWithLlm(
  structured: StructuredExtraction,
  fileName: string
): Promise<ClassificationResult> {
  try {
    const result = await classifyDocument({
      rawText: structured.raw_text,
      structuredData: {
        vendor_name: structured.vendor_name,
        customer_name: structured.customer_name,
        document_date: structured.document_date,
        invoice_number: structured.invoice_number,
        total_amount: structured.total_amount,
        tax_amount: structured.tax_amount,
      },
      fileName,
    });

    // Validate returned type is one of OCR_CLASSIFIABLE_TYPES
    const validType = (OCR_CLASSIFIABLE_TYPES as readonly string[]).includes(result.documentType)
      ? result.documentType
      : 'other';

    return {
      documentType: validType,
      confidence: result.confidence,
      method: 'llm',
      reasoning: result.reasoning,
    };
  } catch (error) {
    // LLM failure is non-fatal for classification — default to 'other'
    const msg = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      level: 'warn',
      job: 'classification',
      message: `LLM classification failed, defaulting to other: ${msg}`,
      timestamp: new Date().toISOString(),
    }));

    return {
      documentType: 'other',
      confidence: 0.0,
      method: 'llm',
      reasoning: `LLM call failed: ${msg}`,
    };
  }
}

// Export for testing
export { applyRules as _applyRules };
