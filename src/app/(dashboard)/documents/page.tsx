'use client';

import { useState } from 'react';
import { DocumentUpload } from '@/components/documents/document-upload';
import { DocumentList } from '@/components/documents/document-list';
import { DocumentFiltersPanel, type DocumentFilters } from '@/components/documents/document-filters';
import { DocumentSearchPanel, type DocumentSearchFilters } from '@/components/documents/document-search-panel';

export default function DocumentsPage() {
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [searchFilters, setSearchFilters] = useState<DocumentSearchFilters>({});
  const [refreshKey, setRefreshKey] = useState(0);

  // Merge both filter sets for the document list
  const mergedFilters = { ...filters, ...searchFilters };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">証憑管理</h1>
        <p className="text-muted-foreground mt-1">
          証憑のアップロード・OCR処理・管理・電帳法検索
        </p>
      </div>

      <DocumentUpload
        onUploadComplete={() => setRefreshKey((k) => k + 1)}
      />

      <DocumentSearchPanel filters={searchFilters} onChange={setSearchFilters} />

      <div className="space-y-4">
        <DocumentFiltersPanel filters={filters} onChange={setFilters} />
        <DocumentList key={refreshKey} filters={mergedFilters} />
      </div>
    </div>
  );
}
