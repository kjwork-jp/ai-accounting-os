import { Queue } from 'bullmq';
import { getRedisConfig } from './connection';

/**
 * Queue names matching 技術設計書 06_ジョブ設計.
 * heavy: OCR/DI processing (long timeout, rate limited)
 * light: validation, journal suggestion (short timeout)
 */
export const QUEUE_NAMES = {
  heavy: 'heavy',
  light: 'light',
} as const;

let heavyQueue: Queue | null = null;
let lightQueue: Queue | null = null;

export function getHeavyQueue(): Queue {
  if (!heavyQueue) {
    heavyQueue = new Queue(QUEUE_NAMES.heavy, {
      connection: getRedisConfig(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s → 30s → 3m → 15m → ~1h
        },
        removeOnComplete: { count: 100 },
        removeOnFail: false, // Keep for DLQ inspection
      },
    });
  }
  return heavyQueue;
}

export function getLightQueue(): Queue {
  if (!lightQueue) {
    lightQueue = new Queue(QUEUE_NAMES.light, {
      connection: getRedisConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 200 },
        removeOnFail: false,
      },
    });
  }
  return lightQueue;
}
