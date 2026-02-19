import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';

/**
 * GET /api/v1/journals/drafts/:id
 * Fetch journal draft detail with related document and extraction.
 * Requires: journals:view (admin, accounting)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  const { id: draftId } = await params;
  const admin = createAdminSupabase();

  // Fetch draft with document join
  const { data: draft, error: draftError } = await admin
    .from('journal_drafts')
    .select('*, documents(id, file_name, document_type, amount, document_date, storage_bucket, file_key)')
    .eq('id', draftId)
    .eq('tenant_id', result.auth.tenantId)
    .single();

  if (draftError || !draft) {
    return notFound('仕訳候補が見つかりません');
  }

  // Fetch extraction for the document
  let extraction = null;
  if (draft.document_id) {
    const { data: ext } = await admin
      .from('document_extractions')
      .select('*')
      .eq('document_id', draft.document_id)
      .eq('tenant_id', result.auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    extraction = ext;
  }

  // Fetch invoice check
  let invoiceCheck = null;
  if (draft.document_id) {
    const { data: check } = await admin
      .from('invoice_checks')
      .select('*')
      .eq('document_id', draft.document_id)
      .eq('tenant_id', result.auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    invoiceCheck = check;
  }

  return ok({
    data: {
      ...draft,
      extraction,
      invoice_check: invoiceCheck,
    },
  });
}
