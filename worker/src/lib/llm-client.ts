import Anthropic from '@anthropic-ai/sdk';

export interface ClassifyDocumentInput {
  rawText: string;
  structuredData: Record<string, unknown>;
  fileName: string;
}

export interface ClassifyDocumentOutput {
  documentType: string;
  confidence: number;
  reasoning: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function getModel(): string {
  return process.env.LLM_MODEL || 'claude-sonnet-4-5-20250929';
}

const SYSTEM_PROMPT = `あなたは日本の経理業務における証憑分類の専門家です。
与えられたOCR抽出テキストと構造化データから、証憑の種別を正確に分類してください。

分類カテゴリ:
- invoice: 請求書（取引先からの支払い請求、インボイス）
- receipt: 領収書（支払い済みの証拠、レシート）
- quotation: 見積書（取引先からの見積提案）
- contract: 契約書（契約、覚書、合意書）
- other: 上記に該当しない書類

JSON形式で回答してください:
{"document_type": "...", "confidence": 0.0〜1.0, "reasoning": "分類理由を簡潔に"}`;

/**
 * Classify a document using Claude API.
 * Throws on API errors — the caller is responsible for retry/fallback.
 */
export async function classifyDocument(
  input: ClassifyDocumentInput
): Promise<ClassifyDocumentOutput> {
  const anthropic = getClient();

  const structuredSummary = Object.entries(input.structuredData)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const userMessage = `ファイル名: ${input.fileName}

--- 構造化データ ---
${structuredSummary || '(なし)'}

--- OCR抽出テキスト (先頭4000文字) ---
${input.rawText.slice(0, 4000)}`;

  const response = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 256,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error(`LLM response did not contain valid JSON: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    document_type?: string;
    confidence?: number;
    reasoning?: string;
  };

  return {
    documentType: parsed.document_type ?? 'other',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    reasoning: parsed.reasoning ?? '',
  };
}
