import type { Job } from 'bullmq';
import { createWorkerSupabase } from '../lib/supabase';
import { suggestJournal } from '../lib/llm-client';
import { emitMetric, METRIC } from '../lib/metrics';

export interface JournalSuggestPayload {
  documentId: string;
  tenantId: string;
}

interface CandidateLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  tax_code: string | null;
  memo: string;
}

interface JournalCandidate {
  lines: CandidateLine[];
  description: string;
  reasoning: string;
  confidence: number;
}

interface LlmResponse {
  candidates: JournalCandidate[];
  overall_confidence: number;
}

const SYSTEM_PROMPT = `あなたは日本の会計実務に精通したAI経理担当です。
証憑データから適切な仕訳候補を3つ生成してください。

ルール:
1. 借方合計 = 貸方合計（貸借一致必須）
2. 消費税は税抜経理方式（仮払消費税/仮受消費税を使用）
3. 勘定科目は提供された科目一覧からのみ選択
4. 税区分は TAX10（10%）/ TAX8（軽減8%）/ NONTAX（非課税）/ EXEMPT（免税）
5. 候補は信頼度の高い順に並べる
6. 過去の確定パターンがある場合は優先的に採用

JSON形式で回答:
{
  "candidates": [
    {
      "lines": [
        {"account_code":"...", "account_name":"...", "debit":0, "credit":0, "tax_code":"TAX10", "memo":""}
      ],
      "description": "摘要文",
      "reasoning": "推定理由",
      "confidence": 0.0
    }
  ],
  "overall_confidence": 0.0
}`;

/**
 * journal_suggest job processor.
 * Generates journal entry candidates using Claude API.
 *
 * Flow:
 *   1. Fetch extraction + invoice check
 *   2. Fetch active accounts (m_accounts)
 *   3. Fetch past confirmation patterns (feedback_events)
 *   4. Call Claude API with structured prompt
 *   5. Validate response (debit/credit balance, account codes)
 *   6. Determine status based on confidence thresholds
 *   7. Insert journal_drafts
 */
export async function processJournalSuggest(
  job: Job<JournalSuggestPayload>
): Promise<void> {
  const { documentId, tenantId } = job.data;
  const startTime = Date.now();
  const supabase = createWorkerSupabase();
  const modelVersion = process.env.LLM_MODEL || 'claude-sonnet-4-5-20250929';

  const log = (level: string, message: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      level,
      job: 'journal_suggest',
      jobId: job.id,
      documentId,
      tenantId,
      attempt: job.attemptsMade + 1,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    }));
  };

  log('info', 'Job started');

  try {
    // Step 1: Fetch extraction
    const { data: extraction, error: extErr } = await supabase
      .from('document_extractions')
      .select('extracted_json')
      .eq('document_id', documentId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (extErr || !extraction) {
      throw new Error(`Extraction not found: ${extErr?.message}`);
    }

    const ext = extraction.extracted_json as Record<string, unknown>;

    // Step 2: Fetch invoice check
    const { data: invoiceCheck } = await supabase
      .from('invoice_checks')
      .select('status, reasons')
      .eq('document_id', documentId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Step 3: Fetch active accounts
    const { data: accounts, error: accErr } = await supabase
      .from('m_accounts')
      .select('code, name, category')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('code');

    if (accErr) {
      throw new Error(`Accounts fetch failed: ${accErr.message}`);
    }

    const accountCodes = new Set((accounts ?? []).map(a => a.code));

    // Step 4: Fetch past confirmation patterns (same vendor priority, fallback to recent tenant-wide)
    let pastPatterns = '';
    const vendorName = ext.vendor_name;
    if (vendorName && typeof vendorName === 'string') {
      // Fetch more records, then filter for same vendor client-side
      const { data: feedbacks } = await supabase
        .from('feedback_events')
        .select('user_correction_json, created_at')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'journal_draft')
        .order('created_at', { ascending: false })
        .limit(50);

      if (feedbacks && feedbacks.length > 0) {
        // Prioritize same-vendor patterns (vendor_name stored in user_correction_json)
        const vendorMatches = feedbacks.filter(f => {
          const corr = f.user_correction_json as Record<string, unknown>;
          return corr.vendor_name === vendorName;
        });
        // Use vendor-specific if available, otherwise fall back to all
        const selected = vendorMatches.length > 0
          ? vendorMatches.slice(0, 10)
          : feedbacks.slice(0, 5); // Fewer fallback items to reduce noise

        pastPatterns = selected
          .map((f, i) => {
            const corr = f.user_correction_json as Record<string, unknown>;
            return `パターン${i + 1}: ${JSON.stringify(corr)}`;
          })
          .join('\n');
      }
    }

    // Step 5: Build user message
    const accountList = (accounts ?? [])
      .map(a => `${a.code} ${a.name} (${a.category})`)
      .join('\n');

    const lineItemsText = Array.isArray(ext.line_items)
      ? (ext.line_items as Array<Record<string, unknown>>)
          .map((item, i) => `  ${i + 1}. ${item.description || '(不明)'} 数量:${item.quantity ?? '-'} 単価:${item.unit_price ?? '-'} 金額:${item.amount ?? '-'}`)
          .join('\n')
      : '(なし)';

    const invoiceCheckText = invoiceCheck
      ? `ステータス: ${invoiceCheck.status}\n${Array.isArray(invoiceCheck.reasons) ? (invoiceCheck.reasons as Array<Record<string, unknown>>).map((r) => `- ${r.message}`).join('\n') : ''}`
      : '(未チェック)';

    const userMessage = `--- 証憑情報 ---
文書種別: ${ext.document_type ?? '不明'}
取引先: ${ext.vendor_name ?? '不明'}
書類日付: ${ext.document_date ?? '不明'}
合計金額: ¥${ext.total_amount ?? '不明'}
税額: ¥${ext.tax_amount ?? '不明'}
明細:
${lineItemsText}

--- インボイスチェック ---
${invoiceCheckText}

--- 使用可能な勘定科目 ---
${accountList}

${pastPatterns ? `--- 過去の確定パターン（同一取引先） ---\n${pastPatterns}` : ''}`;

    // Step 6: Call Claude API via shared llm-client
    const responseText = await suggestJournal({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: userMessage.slice(0, 8000),
    });

    // Step 7: Parse and validate response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`LLM response did not contain valid JSON: ${responseText.slice(0, 200)}`);
    }

    let parsed: LlmResponse;
    try {
      parsed = JSON.parse(jsonMatch[0]) as LlmResponse;
    } catch {
      throw new Error(`Failed to parse LLM JSON: ${jsonMatch[0].slice(0, 200)}`);
    }

    if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
      throw new Error('LLM returned no candidates');
    }

    // Limit to top 3
    const candidates = parsed.candidates.slice(0, 3);

    // Validate each candidate
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];

      // Check debit/credit balance
      const totalDebit = cand.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
      const totalCredit = cand.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        log('warn', `Candidate ${i} debit/credit mismatch`, { totalDebit, totalCredit });
        throw new Error(`Candidate ${i}: debit(${totalDebit}) != credit(${totalCredit})`);
      }

      // Validate account codes exist
      for (const line of cand.lines) {
        if (!accountCodes.has(line.account_code)) {
          log('warn', `Candidate ${i} unknown account_code: ${line.account_code}`);
        }
      }

      // Clamp confidence (F-07: numeric(3,2) overflow protection)
      cand.confidence = Math.min(1.0, Math.max(0.0, cand.confidence ?? 0));
    }

    const overallConfidence = Math.min(1.0, Math.max(0.0, parsed.overall_confidence ?? candidates[0]?.confidence ?? 0));

    // Step 8: Determine status from tenant settings thresholds
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('auto_confirm_high, auto_confirm_mid')
      .eq('tenant_id', tenantId)
      .single();

    const highThreshold = settings?.auto_confirm_high ?? 0.90;
    const midThreshold = settings?.auto_confirm_mid ?? 0.70;

    let draftStatus: 'suggested' | 'needs_review';
    let aiReason = candidates[0]?.reasoning ?? null;
    if (overallConfidence >= highThreshold) {
      draftStatus = 'suggested'; // One-click confirm candidate
    } else if (overallConfidence >= midThreshold) {
      draftStatus = 'needs_review';
    } else {
      draftStatus = 'needs_review';
      // Mark low-confidence drafts for UI distinction (§F-09: 3-tier confidence)
      aiReason = `[低信頼度] ${aiReason ?? '情報不足のため確認が必要です'}`;
    }

    // Step 9: Insert journal_drafts
    const { error: draftErr } = await supabase
      .from('journal_drafts')
      .insert({
        tenant_id: tenantId,
        document_id: documentId,
        status: draftStatus,
        candidates_json: candidates as unknown as Record<string, unknown>,
        confidence: overallConfidence,
        ai_reason: aiReason,
        model_version: modelVersion,
      });

    if (draftErr) {
      throw new Error(`journal_drafts insert failed: ${draftErr.message}`);
    }

    const latencyMs = Date.now() - startTime;
    log('info', 'Job succeeded', {
      status: draftStatus,
      candidateCount: candidates.length,
      overallConfidence,
      highThreshold,
      latencyMs,
    });
    emitMetric(METRIC.JOURNAL_SUGGEST_SUCCESS, 1, { documentId, status: draftStatus });
    emitMetric(METRIC.JOURNAL_SUGGEST_LATENCY_MS, latencyMs, { documentId, tenantId });
    emitMetric(METRIC.JOURNAL_SUGGEST_CONFIDENCE, overallConfidence, { documentId });
  } catch (error) {
    // Insert error draft so UI can show failure state
    try {
      await supabase
        .from('journal_drafts')
        .insert({
          tenant_id: tenantId,
          document_id: documentId,
          status: 'error',
          candidates_json: {},
          confidence: null,
          ai_reason: error instanceof Error ? error.message : String(error),
          model_version: modelVersion,
        });
    } catch (insertErr) {
      log('error', 'Failed to insert error draft', {
        insertError: insertErr instanceof Error ? insertErr.message : String(insertErr),
      });
    }

    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', 'Job failed', { error: errorMessage, latencyMs });
    emitMetric(METRIC.JOURNAL_SUGGEST_FAILURE, 1, { documentId, tenantId });
    emitMetric(METRIC.JOURNAL_SUGGEST_LATENCY_MS, latencyMs, { documentId, tenantId, failed: true });

    throw error;
  }
}
