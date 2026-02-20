import { NextResponse } from 'next/server';
import { getHeavyQueue } from '@/lib/queue/queues';

export async function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}

/**
 * POST /api/v1/health?check=redis
 * Deep health check — verifies Redis connectivity for queue operations.
 * Used to diagnose whether Vercel environment variables are correctly set.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const check = searchParams.get('check');

  if (check === 'redis') {
    try {
      const queue = getHeavyQueue();
      const isPaused = await queue.isPaused();
      return NextResponse.json({
        ok: true,
        redis: 'connected',
        queuePaused: isPaused,
        host: process.env.AZURE_REDIS_HOST ? '***' + process.env.AZURE_REDIS_HOST.slice(-20) : 'NOT_SET',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({
        ok: false,
        redis: 'error',
        error: message,
        host: process.env.AZURE_REDIS_HOST ? '***' + process.env.AZURE_REDIS_HOST.slice(-20) : 'NOT_SET',
      }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
