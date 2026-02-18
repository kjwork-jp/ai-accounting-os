import { NextRequest } from 'next/server';
import { requireAuth, ok, notFound } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';

/**
 * GET /api/v1/documents/:id
 * Fetch document detail with extractions and invoice check.
 * Requires: documents:view (admin, accounting, viewer)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const { id: documentId } = await params;
  const admin = createAdminSupabase();

  // Fetch document
  const { data: doc, error: docError } = await admin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (docError || !doc) {
    return notFound('ドキュメントが見つかりません');
  }

  // Fetch latest extraction
  const { data: extraction } = await admin
    .from('document_extractions')
    .select('*')
    .eq('document_id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch invoice check
  const { data: invoiceCheck } = await admin
    .from('invoice_checks')
    .select('*')
    .eq('document_id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return ok({
    data: {
      ...doc,
      extraction: extraction ?? null,
      invoice_check: invoiceCheck ?? null,
    },
  });
}
