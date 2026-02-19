import { getLightQueue } from './queues';

export interface InvoiceValidatePayload {
  documentId: string;
  tenantId: string;
}

export interface JournalSuggestPayload {
  documentId: string;
  tenantId: string;
}

/**
 * Enqueue an invoice_validate job to the light queue.
 * jobId includes timestamp to avoid BullMQ rejecting re-enqueue after removeOnComplete.
 */
export async function enqueueInvoiceValidate(
  payload: InvoiceValidatePayload
): Promise<string> {
  const queue = getLightQueue();
  const jobId = `invoice_validate:${payload.documentId}:${Date.now()}`;

  const job = await queue.add('invoice_validate', payload, { jobId });
  return job.id ?? jobId;
}

/**
 * Enqueue a journal_suggest job to the light queue.
 * jobId includes timestamp to avoid BullMQ rejecting re-enqueue after removeOnComplete.
 */
export async function enqueueJournalSuggest(
  payload: JournalSuggestPayload
): Promise<string> {
  const queue = getLightQueue();
  const jobId = `journal_suggest:${payload.documentId}:${Date.now()}`;

  const job = await queue.add('journal_suggest', payload, { jobId });
  return job.id ?? jobId;
}
