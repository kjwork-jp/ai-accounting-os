/**
 * Reconciliation matching logic.
 * Matches payments against journal entries by amount, date proximity, and name similarity.
 * See WBS 3.4.2 明細-仕訳突合.
 */

import { computeNameSimilarity } from '@/lib/partners/name-matching';

interface PaymentForMatch {
  id: string;
  occurred_on: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty_name_raw: string | null;
}

interface JournalEntryForMatch {
  id: string;
  entry_date: string;
  total_amount: number;
  description: string | null;
}

export interface ReconciliationCandidate {
  payment_id: string;
  target_type: 'journal_entry';
  target_id: string;
  confidence: number;
  match_reasons: string[];
}

/**
 * Find reconciliation candidates by matching payments to journal entries.
 * Returns candidates with confidence scores (0-1).
 */
export function findReconciliationCandidates(
  payments: PaymentForMatch[],
  entries: JournalEntryForMatch[]
): ReconciliationCandidate[] {
  const candidates: ReconciliationCandidate[] = [];

  for (const payment of payments) {
    let bestMatch: ReconciliationCandidate | null = null;

    for (const entry of entries) {
      const reasons: string[] = [];
      let score = 0;

      // Amount match (most important — 0.5 weight)
      if (payment.amount === entry.total_amount) {
        score += 0.5;
        reasons.push('金額完全一致');
      } else {
        const amountDiff = Math.abs(payment.amount - entry.total_amount);
        const amountRatio = amountDiff / Math.max(payment.amount, entry.total_amount);
        if (amountRatio <= 0.01) {
          score += 0.3;
          reasons.push('金額近似一致');
        } else {
          continue; // Skip if amount is too different
        }
      }

      // Date proximity (0.3 weight — within ±3 days)
      const paymentDate = new Date(payment.occurred_on);
      const entryDate = new Date(entry.entry_date);
      const daysDiff = Math.abs(
        (paymentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 0) {
        score += 0.3;
        reasons.push('日付完全一致');
      } else if (daysDiff <= 1) {
        score += 0.25;
        reasons.push('日付±1日');
      } else if (daysDiff <= 3) {
        score += 0.15;
        reasons.push('日付±3日以内');
      } else if (daysDiff <= 7) {
        score += 0.05;
        reasons.push('日付±7日以内');
      } else {
        continue; // Skip if date is too far
      }

      // Name similarity (0.2 weight)
      if (payment.counterparty_name_raw && entry.description) {
        const similarity = computeNameSimilarity(
          payment.counterparty_name_raw,
          entry.description
        );
        if (similarity >= 0.5) {
          score += similarity * 0.2;
          reasons.push(`摘要類似(${Math.round(similarity * 100)}%)`);
        }
      }

      const confidence = Math.round(score * 100) / 100;

      if (confidence >= 0.4 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = {
          payment_id: payment.id,
          target_type: 'journal_entry',
          target_id: entry.id,
          confidence,
          match_reasons: reasons,
        };
      }
    }

    if (bestMatch) {
      candidates.push(bestMatch);
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}
