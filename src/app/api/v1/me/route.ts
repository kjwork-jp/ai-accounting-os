import { NextRequest } from 'next/server';
import { requireAuth, ok } from '@/lib/api/helpers';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const { auth } = result;

  return ok({
    userId: auth.userId,
    tenantId: auth.tenantId,
    role: auth.role,
  });
}
