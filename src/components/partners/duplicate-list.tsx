'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface DuplicateCandidate {
  partner_id: string;
  partner_name: string;
  match_partner_id: string;
  match_partner_name: string;
  similarity: number;
}

interface DuplicateListProps {
  refreshKey?: number;
}

export function DuplicateList({ refreshKey }: DuplicateListProps) {
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDuplicates = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/partners/duplicates');
        if (res.ok) {
          const json = await res.json();
          setDuplicates(json.data);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDuplicates();
  }, [refreshKey]);

  if (!loading && duplicates.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="p-4 border-b">
        <h3 className="font-semibold">重複候補</h3>
        <p className="text-sm text-muted-foreground">名前が類似する取引先ペアです</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>取引先1</TableHead>
            <TableHead>取引先2</TableHead>
            <TableHead>類似度</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                検索中...
              </TableCell>
            </TableRow>
          ) : (
            duplicates.map((d, i) => (
              <TableRow key={i}>
                <TableCell>{d.partner_name}</TableCell>
                <TableCell>{d.match_partner_name}</TableCell>
                <TableCell>
                  <Badge variant={d.similarity >= 0.9 ? 'destructive' : 'outline'}>
                    {Math.round(d.similarity * 100)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
