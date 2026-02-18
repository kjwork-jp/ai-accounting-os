import { Worker } from 'bullmq';
import { processDocumentParse } from './jobs/document-parse';

/**
 * Worker entry point for Azure Container Apps Jobs.
 * Consumes the heavy queue (document_parse jobs).
 *
 * Rate limiter: max 15 jobs/sec (Azure DI POST 15TPS limit).
 * Concurrency: 2 (ACA vCPU constraint).
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

const worker = new Worker(
  'heavy',
  async (job) => {
    if (job.name === 'document_parse') {
      await processDocumentParse(job);
    } else {
      console.log(JSON.stringify({
        level: 'warn',
        message: `Unknown job name: ${job.name}`,
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

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(JSON.stringify({
    level: 'info',
    message: `Received ${signal}, shutting down worker...`,
    timestamp: new Date().toISOString(),
  }));
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

worker.on('ready', () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'Worker ready, listening on heavy queue',
    concurrency: 2,
    rateLimitTps: 15,
    timestamp: new Date().toISOString(),
  }));
});

worker.on('failed', (job, err) => {
  console.log(JSON.stringify({
    level: 'error',
    message: 'Job failed',
    jobId: job?.id,
    jobName: job?.name,
    attempt: job?.attemptsMade,
    error: err.message,
    timestamp: new Date().toISOString(),
  }));
});
