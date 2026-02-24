'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { Partner, PartnerCategory } from '@/types/database';

interface PartnerListProps {
  onEdit?: (partner: Partner) => void;
  onMerge?: (partner: Partner) => void;
  refreshKey?: number;
}

interface PaginationInfo {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

const CATEGORY_LABELS: Record<PartnerCategory, string> = {
  customer: '顧客',
  supplier: '仕入先',
  both: '両方',
};

export function PartnerList({ onEdit, onMerge, refreshKey }: PartnerListProps) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPartners = useCallback(async (page = 1, searchQuery = '') => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: '20',
    });
    if (searchQuery) params.set('search', searchQuery);

    try {
      const res = await fetch(`/api/v1/partners?${params}`);
      if (res.ok) {
        const json = await res.json();
        setPartners(json.data);
        setPagination(json.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners(1, search);
  }, [fetchPartners, refreshKey, search]);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  return (
    <Card>
      <div className="p-4 border-b">
        <Input
          placeholder="取引先名で検索..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>取引先名</TableHead>
            <TableHead>カナ</TableHead>
            <TableHead>区分</TableHead>
            <TableHead>登録番号</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                読み込み中...
              </TableCell>
            </TableRow>
          ) : partners.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                取引先がありません
              </TableCell>
            </TableRow>
          ) : (
            partners.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell className="font-medium">{partner.name}</TableCell>
                <TableCell className="text-muted-foreground">{partner.name_kana || '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline">{CATEGORY_LABELS[partner.category]}</Badge>
                </TableCell>
                <TableCell className="text-sm">{partner.registration_number || '—'}</TableCell>
                <TableCell className="text-sm">{partner.email || '—'}</TableCell>
                <TableCell>
                  <Badge variant={partner.is_active ? 'default' : 'secondary'}>
                    {partner.is_active ? '有効' : '無効'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    {onEdit && (
                      <Button variant="outline" size="sm" onClick={() => onEdit(partner)}>
                        編集
                      </Button>
                    )}
                    {onMerge && (
                      <Button variant="outline" size="sm" onClick={() => onMerge(partner)}>
                        統合
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {pagination.total} 件中 {((pagination.page - 1) * pagination.per_page) + 1}–
            {Math.min(pagination.page * pagination.per_page, pagination.total)} 件表示
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchPartners(pagination.page - 1, search)}
            >
              前へ
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => fetchPartners(pagination.page + 1, search)}
            >
              次へ
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
