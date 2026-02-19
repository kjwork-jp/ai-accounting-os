import { Worker } from 'bullmq';
import { processDocumentParse } from './jobs/document-parse';
import { processInvoiceValidate } from './jobs/invoice-validate';
import { processJournalSuggest } from './jobs/journal-suggest';

/**
 * Worker entry point for Azure Container Apps Jobs.
 *
 * heavy queue: document_parse (OCR/DI)
 *   Rate limiter: max 15 jobs/sec (Azure DI POST 15TPS limit).
 *   Concurrency: 2 (ACA vCPU constraint).
 *
 * light queue: invoice_validate, journal_suggest
 *   Concurrency: 4 (CPU-light, I/O-bound tasks).
 */

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

const heavyWorker = new Worker(
  'heavy',
  async (job) => {
    if (job.name === 'document_parse') {
      await processDocumentParse(job);
    } else {
      console.log(JSON.stringify({
        level: 'warn',
        message: `Unknown heavy job: ${job.name}`,
        jobId: job.id,
        timestamp: new Date().toISOString(),
      }));
    }
  },
  {
    connection: getRedisConfig(),
    concurrency: 2,
    limiter: {
      max: 15,
      duration: 1000, // 15 TPS cap for Azure DI
    },
  }
);

const lightWorker = new Worker(
  'light',
  async (job) => {
    switch (job.name) {
      case 'invoice_validate':
        return processInvoiceValidate(job);
      case 'journal_suggest':
        return processJournalSuggest(job);
      default:
        console.log(JSON.stringify({
          level: 'warn',
          message: `Unknown light job: ${job.name}`,
          jobId: job.id,
          timestamp: new Date().toISOString(),
        }));
    }
  },
  {
    connection: getRedisConfig(),
    concurrency: 4,
  }
);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(JSON.stringify({
    level: 'info',
    message: `Received ${signal}, shutting down workers...`,
    timestamp: new Date().toISOString(),
  }));
  await Promise.all([heavyWorker.close(), lightWorker.close()]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

heavyWorker.on('ready', () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'Heavy worker ready, listening on heavy queue',
    concurrency: 2,
    rateLimitTps: 15,
    timestamp: new Date().toISOString(),
  }));
});

lightWorker.on('ready', () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'Light worker ready, listening on light queue',
    concurrency: 4,
    timestamp: new Date().toISOString(),
  }));
});

for (const [name, w] of [['heavy', heavyWorker], ['light', lightWorker]] as const) {
  w.on('failed', (job, err) => {
    console.log(JSON.stringify({
      level: 'error',
      message: 'Job failed',
      queue: name,
      jobId: job?.id,
      jobName: job?.name,
      attempt: job?.attemptsMade,
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
  });
}
