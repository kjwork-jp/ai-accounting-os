import { redirect, notFound } from 'next/navigation';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import { getCurrentTenantUser } from '@/lib/auth/helpers';
import { DocumentDetail } from '@/components/documents/document-detail';
import { DocumentJournalSection } from '@/components/journals/document-journal-section';

interface DocumentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenantUser = await getCurrentTenantUser();
  if (!tenantUser) redirect('/login');

  const { id } = await params;
  const admin = createAdminSupabase();

  // Fetch document with tenant isolation
  const { data: doc, error: docError } = await admin
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantUser.tenant_id)
    .single();

  if (docError || !doc) {
    notFound();
  }

  // Fetch latest extraction
  const { data: extraction } = await admin
    .from('document_extractions')
    .select('*')
    .eq('document_id', id)
    .eq('tenant_id', tenantUser.tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch journal draft
  const { data: journalDraft } = await admin
    .from('journal_drafts')
    .select('*')
    .eq('document_id', id)
    .eq('tenant_id', tenantUser.tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch journal entry if confirmed
  let journalEntry = null;
  if (journalDraft?.status === 'confirmed') {
    const { data: entry } = await admin
      .from('journal_entries')
      .select('*, journal_lines(*)')
      .eq('journal_draft_id', journalDraft.id)
      .eq('tenant_id', tenantUser.tenant_id)
      .single();
    journalEntry = entry;
  }

  // Use preview API endpoint instead of signed URL to avoid storage policy issues
  const previewUrl = `/api/v1/documents/${id}/preview`;

  const canRetry = tenantUser.role === 'admin' || tenantUser.role === 'accounting';
  const canConfirm = tenantUser.role === 'admin' || tenantUser.role === 'accounting';

  return (
    <div className="space-y-6">
      <DocumentDetail
        document={doc}
        extraction={extraction ?? null}
        previewUrl={previewUrl}
        canRetry={canRetry}
      />
      {journalDraft && (
        <DocumentJournalSection
          draft={journalDraft}
          journalEntry={journalEntry}
          canConfirm={canConfirm}
        />
      )}
    </div>
  );
}
