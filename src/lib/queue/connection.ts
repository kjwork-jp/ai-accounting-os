import type { RedisOptions } from 'ioredis';

/**
 * Redis connection config for BullMQ.
 * Azure Cache for Redis requires TLS on port 6380.
 * Returns a config object (not an IORedis instance) to avoid
 * version mismatches between ioredis and bullmq's bundled ioredis.
 */
export function getRedisConfig(): RedisOptions {
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
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times: number) {
      return Math.min(times * 500, 5000);
    },
  };
}
