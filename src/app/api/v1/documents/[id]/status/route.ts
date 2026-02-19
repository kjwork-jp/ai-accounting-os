import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';

/**
 * GET /api/v1/documents/:id/status
 * Lightweight polling endpoint for document processing status.
 * Frontend polls this at 5-second intervals while status is queued/processing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const { id: documentId } = await params;
  const admin = createAdminSupabase();

  const { data: doc, error } = await admin
    .from('documents')
    .select('status, updated_at')
    .eq('id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (error || !doc) {
    return notFound('ドキュメントが見つかりません');
  }

  return ok({
    data: {
      status: doc.status,
      updated_at: doc.updated_at,
    },
  });
}
