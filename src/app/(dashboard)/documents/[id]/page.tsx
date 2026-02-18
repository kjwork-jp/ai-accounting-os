import { redirect, notFound } from 'next/navigation';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import { getCurrentTenantUser } from '@/lib/auth/helpers';
import { DocumentDetail } from '@/components/documents/document-detail';

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

  // Generate signed URL for file preview (60-minute expiry)
  let signedUrl: string | null = null;
  if (doc.storage_bucket && doc.file_key) {
    const { data: signedUrlData } = await admin.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.file_key, 3600);
    signedUrl = signedUrlData?.signedUrl ?? null;
  }

  const canRetry = tenantUser.role === 'admin' || tenantUser.role === 'accounting';

  return (
    <DocumentDetail
      document={doc}
      extraction={extraction ?? null}
      signedUrl={signedUrl}
      canRetry={canRetry}
    />
  );
}
