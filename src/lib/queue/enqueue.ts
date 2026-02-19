import { getHeavyQueue } from './queues';

export interface DocumentParsePayload {
  documentId: string;
  tenantId: string;
}

/**
 * Enqueue a document_parse job to the heavy queue.
 * jobId includes timestamp to avoid BullMQ rejecting re-enqueue after removeOnComplete.
 * Duplicate prevention is handled by status gate (optimistic lock) in API layer.
 */
export async function enqueueDocumentParse(
  payload: DocumentParsePayload
): Promise<string> {
  const queue = getHeavyQueue();
  const jobId = `doc_parse:${payload.documentId}:${Date.now()}`;

  const job = await queue.add('document_parse', payload, {
    jobId,
  });

  return job.id ?? jobId;
}
