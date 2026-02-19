import { Queue } from 'bullmq';

let lightQueue: Queue | null = null;

function getRedisConfig() {
  const host = process.env.AZURE_REDIS_HOST;
  const port = Number(process.env.AZURE_REDIS_PORT || '6380');
  const password = process.env.AZURE_REDIS_KEY;

  if (!host || !password) {
    throw new Error('AZURE_REDIS_HOST and AZURE_REDIS_KEY are required');
  }

  return {
    host,
    port,
    password,
    tls: { servername: host },
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

function getLightQueue(): Queue {
  if (!lightQueue) {
    lightQueue = new Queue('light', {
      connection: getRedisConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: false,
      },
    });
  }
  return lightQueue;
}

/**
 * Enqueue invoice_validate job from Worker process.
 */
export async function enqueueInvoiceValidate(payload: {
  documentId: string;
  tenantId: string;
}): Promise<string> {
  const queue = getLightQueue();
  const jobId = `invoice_validate:${payload.documentId}:${Date.now()}`;
  const job = await queue.add('invoice_validate', payload, { jobId });
  return job.id ?? jobId;
}

/**
 * Enqueue journal_suggest job from Worker process.
 */
export async function enqueueJournalSuggest(payload: {
  documentId: string;
  tenantId: string;
}): Promise<string> {
  const queue = getLightQueue();
  const jobId = `journal_suggest:${payload.documentId}:${Date.now()}`;
  const job = await queue.add('journal_suggest', payload, { jobId });
  return job.id ?? jobId;
}
