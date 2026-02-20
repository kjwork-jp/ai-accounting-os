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

  // Generate signed URL for file preview (60-minute expiry)
  let signedUrl: string | null = null;
  if (doc.storage_bucket && doc.file_key) {
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.file_key, 3600);
    if (signedUrlError) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Failed to create signed URL for document preview',
        documentId: id,
        bucket: doc.storage_bucket,
        fileKey: doc.file_key,
        error: signedUrlError.message,
        timestamp: new Date().toISOString(),
      }));
    }
    signedUrl = signedUrlData?.signedUrl ?? null;
  }

  const canRetry = tenantUser.role === 'admin' || tenantUser.role === 'accounting';
  const canConfirm = tenantUser.role === 'admin' || tenantUser.role === 'accounting';

  return (
    <div className="space-y-6">
      <DocumentDetail
        document={doc}
        extraction={extraction ?? null}
        signedUrl={signedUrl}
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
