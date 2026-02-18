import { getHeavyQueue } from './queues';

export interface DocumentParsePayload {
  documentId: string;
  tenantId: string;
}

/**
 * Enqueue a document_parse job to the heavy queue.
 * Uses documentId as jobId for idempotency (prevents duplicate enqueue).
 */
export async function enqueueDocumentParse(
  payload: DocumentParsePayload
): Promise<string> {
  const queue = getHeavyQueue();
  const jobId = `doc_parse:${payload.documentId}`;

  const job = await queue.add('document_parse', payload, {
    jobId,
  });

  return job.id ?? jobId;
}
