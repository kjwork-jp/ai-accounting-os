import type { DiAnalyzeResult, DiField } from '../lib/di-client';

/**
 * Structured extraction output matching DB document_extractions.extracted_json.
 * Maps Azure DI prebuilt-invoice fields to unified JSON schema.
 */
export interface StructuredExtraction {
  vendor_name: string | null;
  vendor_address: string | null;
  vendor_registration_number: string | null;
  customer_name: string | null;
  document_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  tax_details: Array<{
    rate: number;
    taxable_amount: number;
    tax_amount: number;
  }>;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
    tax_rate: number | null;
  }>;
  raw_text: string;
  confidence: number;
}

/**
 * Extract a string value from a DI field.
 */
function getString(field: DiField | undefined): string | null {
  if (!field) return null;
  return field.valueString ?? field.content ?? null;
}

/**
 * Extract a number value from a DI field (supports currency fields).
 */
function getNumber(field: DiField | undefined): number | null {
  if (!field) return null;
  if (field.valueCurrency?.amount != null) return field.valueCurrency.amount;
  if (field.valueNumber != null) return field.valueNumber;
  if (field.content) {
    const cleaned = field.content.replace(/[^0-9.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Extract a date value from a DI field, normalize to YYYY-MM-DD.
 */
function getDate(field: DiField | undefined): string | null {
  if (!field) return null;
  if (field.valueDate) return field.valueDate;
  if (!field.content) return null;
  return normalizeDateString(field.content);
}

/**
 * Normalize Japanese date formats to YYYY-MM-DD.
 * Supports: 令和X年Y月Z日, 20XX年Y月Z日, 20XX/Y/Z, 20XX-Y-Z
 */
export function normalizeDateString(raw: string): string | null {
  // 令和 era conversion
  const reiwMatch = raw.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (reiwMatch) {
    const year = 2018 + parseInt(reiwMatch[1], 10);
    const month = reiwMatch[2].padStart(2, '0');
    const day = reiwMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 西暦 YYYY年M月D日
  const jpMatch = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (jpMatch) {
    return `${jpMatch[1]}-${jpMatch[2].padStart(2, '0')}-${jpMatch[3].padStart(2, '0')}`;
  }

  // YYYY/MM/DD or YYYY-MM-DD
  const slashMatch = raw.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`;
  }

  return null;
}

/**
 * Extract Japan invoice registration number (T + 13 digits) from text.
 */
export function extractRegistrationNumber(text: string): string | null {
  const match = text.match(/T\d{13}/);
  return match ? match[0] : null;
}

/**
 * Convert Azure DI analysis result to structured extraction JSON.
 */
export function structureExtraction(result: DiAnalyzeResult): StructuredExtraction {
  const { fields, items, content, confidence } = result;

  // Map DI fields to structured output
  const structured: StructuredExtraction = {
    vendor_name: getString(fields.VendorName),
    vendor_address: getString(fields.VendorAddress) ?? getString(fields.VendorAddressRecipient),
    vendor_registration_number:
      getString(fields.VendorTaxId) ?? extractRegistrationNumber(content),
    customer_name: getString(fields.CustomerName),
    document_date: getDate(fields.InvoiceDate),
    due_date: getDate(fields.DueDate),
    invoice_number: getString(fields.InvoiceId),
    subtotal: getNumber(fields.SubTotal),
    tax_amount: getNumber(fields.TotalTax),
    total_amount: getNumber(fields.InvoiceTotal),
    tax_details: [],
    line_items: [],
    raw_text: content,
    confidence,
  };

  // Parse line items
  for (const item of items) {
    structured.line_items.push({
      description: getString(item.Description) ?? '',
      quantity: getNumber(item.Quantity),
      unit_price: getNumber(item.UnitPrice),
      amount: getNumber(item.Amount) ?? 0,
      tax_rate: getNumber(item.Tax),
    });
  }

  return structured;
}
