/**
 * Azure Document Intelligence REST API client.
 * Supports model switching (prebuilt-invoice / prebuilt-read).
 * Compliant with 技術設計書 07_安全柵仕様:
 *   - POST <= 15 TPS (enforced by BullMQ limiter)
 *   - Polling interval >= 2 seconds
 *   - Retry-After header respected
 *   - 429 → exponential backoff
 */

export type DiModelId = 'prebuilt-invoice' | 'prebuilt-read';

export interface DiField {
  content: string | null;
  confidence: number;
  valueString?: string;
  valueNumber?: number;
  valueDate?: string;
  valueCurrency?: { amount: number; currencyCode: string };
}

export interface DiLineItem {
  Description?: DiField;
  Quantity?: DiField;
  UnitPrice?: DiField;
  Amount?: DiField;
  Tax?: DiField;
}

export interface DiAnalyzeResult {
  modelId: string;
  content: string; // Full OCR text
  fields: Record<string, DiField>;
  items: DiLineItem[];
  confidence: number;
}

const POLL_INTERVAL_MS = 2500; // >= 2 seconds per spec
const MAX_POLL_ATTEMPTS = 100; // ~4 minutes max
const BACKOFF_DELAYS = [2000, 4000, 8000, 16000, 32000];

function getDiConfig() {
  const endpoint = process.env.AZURE_DI_ENDPOINT;
  const key = process.env.AZURE_DI_KEY;
  if (!endpoint || !key) {
    throw new Error('AZURE_DI_ENDPOINT and AZURE_DI_KEY are required');
  }
  return { endpoint: endpoint.replace(/\/$/, ''), key };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Azure DI to analyze a document.
 * Returns structured extraction result.
 */
export async function analyzeDocument(
  fileBuffer: Uint8Array,
  contentType: string,
  modelId: DiModelId = 'prebuilt-invoice'
): Promise<DiAnalyzeResult> {
  const { endpoint, key } = getDiConfig();
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=2024-11-30`;

  // Step 1: POST to start analysis
  let response = await fetchWithRetry(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': contentType,
    },
    body: fileBuffer as unknown as BodyInit,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DI analyze POST failed (${response.status}): ${body}`);
  }

  const operationUrl = response.headers.get('operation-location');
  if (!operationUrl) {
    throw new Error('DI response missing operation-location header');
  }

  // Step 2: Poll for result
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    response = await fetchWithRetry(operationUrl, {
      method: 'GET',
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DI poll failed (${response.status}): ${body}`);
    }

    const result = await response.json() as {
      status: string;
      analyzeResult?: {
        modelId: string;
        content: string;
        documents?: Array<{
          fields: Record<string, unknown>;
          confidence: number;
        }>;
      };
    };

    if (result.status === 'succeeded' && result.analyzeResult) {
      return parseAnalyzeResult(result.analyzeResult, modelId);
    }

    if (result.status === 'failed') {
      throw new Error(`DI analysis failed: ${JSON.stringify(result)}`);
    }

    // Check Retry-After header
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const waitMs = parseInt(retryAfter, 10) * 1000;
      if (!isNaN(waitMs) && waitMs > 0) {
        await sleep(waitMs);
      }
    }
  }

  throw new Error(`DI polling timed out after ${MAX_POLL_ATTEMPTS} attempts`);
}

/**
 * Fetch with 429/5xx retry and exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 5
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BACKOFF_DELAYS[Math.min(attempt, BACKOFF_DELAYS.length - 1)];
        await sleep(isNaN(waitMs) ? BACKOFF_DELAYS[attempt] : waitMs);
        continue;
      }
    }

    return response;
  }

  throw new Error(`fetchWithRetry exhausted retries for ${url}`);
}

/**
 * Parse the raw DI API response into our typed structure.
 */
function parseAnalyzeResult(
  raw: {
    modelId: string;
    content: string;
    documents?: Array<{
      fields: Record<string, unknown>;
      confidence: number;
    }>;
  },
  modelId: DiModelId
): DiAnalyzeResult {
  const doc = raw.documents?.[0];

  if (!doc) {
    // prebuilt-read or no documents detected — return raw text only
    return {
      modelId,
      content: raw.content,
      fields: {},
      items: [],
      confidence: 0,
    };
  }

  const fields: Record<string, DiField> = {};
  for (const [key, value] of Object.entries(doc.fields)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      fields[key] = {
        content: (v.content as string) ?? null,
        confidence: (v.confidence as number) ?? 0,
        valueString: v.valueString as string | undefined,
        valueNumber: v.valueNumber as number | undefined,
        valueDate: v.valueDate as string | undefined,
        valueCurrency: v.valueCurrency as
          | { amount: number; currencyCode: string }
          | undefined,
      };
    }
  }

  // Extract line items from Items field
  const items: DiLineItem[] = [];
  const itemsField = doc.fields.Items;
  if (itemsField && typeof itemsField === 'object') {
    const itemsObj = itemsField as { valueArray?: Array<{ valueObject?: Record<string, unknown> }> };
    if (Array.isArray(itemsObj.valueArray)) {
      for (const item of itemsObj.valueArray) {
        if (item.valueObject) {
          const lineItem: DiLineItem = {};
          for (const [k, v] of Object.entries(item.valueObject)) {
            if (v && typeof v === 'object') {
              const fv = v as Record<string, unknown>;
              (lineItem as Record<string, DiField>)[k] = {
                content: (fv.content as string) ?? null,
                confidence: (fv.confidence as number) ?? 0,
                valueString: fv.valueString as string | undefined,
                valueNumber: fv.valueNumber as number | undefined,
                valueDate: fv.valueDate as string | undefined,
                valueCurrency: fv.valueCurrency as
                  | { amount: number; currencyCode: string }
                  | undefined,
              };
            }
          }
          items.push(lineItem);
        }
      }
    }
  }

  return {
    modelId,
    content: raw.content,
    fields,
    items,
    confidence: doc.confidence,
  };
}
