'use client';

import { useState } from 'react';
import { PartnerList } from '@/components/partners/partner-list';
import { PartnerForm } from '@/components/partners/partner-form';
import { PartnerMergeDialog } from '@/components/partners/partner-merge-dialog';
import { DuplicateList } from '@/components/partners/duplicate-list';
import { Button } from '@/components/ui/button';
import type { Partner } from '@/types/database';

type ViewMode = 'list' | 'create' | 'edit' | 'merge';

export default function PartnersPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = (partner: Partner) => {
    setSelectedPartner(partner);
    setViewMode('edit');
  };

  const handleMerge = (partner: Partner) => {
    setSelectedPartner(partner);
    setViewMode('merge');
  };

  const handleSaved = () => {
    setViewMode('list');
    setSelectedPartner(null);
    setRefreshKey((k) => k + 1);
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedPartner(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">取引先管理</h1>
          <p className="text-muted-foreground">
            取引先の登録・編集・名寄せ・統合を行います
          </p>
        </div>
        {viewMode === 'list' && (
          <Button onClick={() => setViewMode('create')}>新規作成</Button>
        )}
      </div>

      {viewMode === 'create' && (
        <PartnerForm onSaved={handleSaved} onCancel={handleCancel} />
      )}

      {viewMode === 'edit' && selectedPartner && (
        <PartnerForm partner={selectedPartner} onSaved={handleSaved} onCancel={handleCancel} />
      )}

      {viewMode === 'merge' && selectedPartner && (
        <PartnerMergeDialog
          targetPartner={selectedPartner}
          onComplete={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {viewMode === 'list' && (
        <>
          <DuplicateList refreshKey={refreshKey} />
          <PartnerList
            onEdit={handleEdit}
            onMerge={handleMerge}
            refreshKey={refreshKey}
          />
        </>
      )}
    </div>
  );
}
