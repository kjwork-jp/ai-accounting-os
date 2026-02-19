import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, notFound } from '@/lib/api/helpers';
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

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

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

  // Fetch journal draft (latest)
  const { data: journalDraft } = await admin
    .from('journal_drafts')
    .select('*')
    .eq('document_id', documentId)
    .eq('tenant_id', result.auth.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch journal entry if draft is confirmed
  let journalEntry = null;
  if (journalDraft?.status === 'confirmed') {
    const { data: entry } = await admin
      .from('journal_entries')
      .select('*, journal_lines(*)')
      .eq('journal_draft_id', journalDraft.id)
      .eq('tenant_id', result.auth.tenantId)
      .single();
    journalEntry = entry;
  }

  return ok({
    data: {
      ...doc,
      extraction: extraction ?? null,
      invoice_check: invoiceCheck ?? null,
      journal_draft: journalDraft ?? null,
      journal_entry: journalEntry,
    },
  });
}
