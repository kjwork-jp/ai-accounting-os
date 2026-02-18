'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Search, Loader2, RotateCcw } from 'lucide-react';
import type { AuditLog } from '@/types/database';

const ACTION_LABELS: Record<string, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  disable: '無効化',
  login: 'ログイン',
  logout: 'ログアウト',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  tenant_users: 'ユーザー',
  documents: '証憑',
  journal_entries: '仕訳',
  invoices: '請求書',
  orders: '受発注',
  approvals: '決裁',
  partners: '取引先',
  tenant_settings: 'テナント設定',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  disable: 'bg-amber-100 text-amber-800',
  login: 'bg-purple-100 text-purple-800',
  logout: 'bg-gray-100 text-gray-800',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (actionFilter && actionFilter !== 'all') params.set('action', actionFilter);
      if (entityFilter && entityFilter !== 'all') params.set('entity_type', entityFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/v1/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? '監査ログの取得に失敗しました');
        return;
      }
      setLogs(json.data ?? []);
    } catch {
      setError('監査ログの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleReset() {
    setDateFrom('');
    setDateTo('');
    setActionFilter('');
    setEntityFilter('');
  }

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      label: '日時',
      sortable: true,
      className: 'w-[180px]',
      render: (row) => (
        <span className="text-sm font-mono">
          {new Date(row.created_at).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'action',
      label: '操作',
      sortable: true,
      render: (row) => (
        <Badge
          className={ACTION_COLORS[row.action] ?? 'bg-gray-100 text-gray-800'}
          variant="secondary"
        >
          {ACTION_LABELS[row.action] ?? row.action}
        </Badge>
      ),
    },
    {
      key: 'entity_type',
      label: '対象',
      sortable: true,
      render: (row) => (
        <div>
          <div className="text-sm font-medium"> 
            {row.entity_name
              ? row.entity_name
              : (ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type)}
          </div>
          <div className="text-xs text-muted-foreground truncate max-w-[200px]"> 
            {row.entity_name
              ? (ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type)
              : (row.entity_id ? `${row.entity_id.slice(0, 8)}...` : '不明')}
          </div>
        </div>
      ),
    },
    {
      key: 'actor_name',
      label: '実行者',
      sortable: true,
      render: (row) => (
        <span className="text-sm">
          {row.actor_name ?? (row.actor_user_id ? `${row.actor_user_id.slice(0, 8)}...` : '不明')}
        </span>
      ),
    },
    {
      key: 'diff_json',
      label: '変更内容',
      render: (row) => {
        if (!row.diff_json || Object.keys(row.diff_json).length === 0) {
          return <span className="text-sm text-muted-foreground">-</span>;
        }
        return (
          <pre className="text-xs bg-gray-50 rounded p-1 max-w-[300px] overflow-auto max-h-[60px]">
            {JSON.stringify(row.diff_json, null, 1)}
          </pre>
        );
      },
    },
    {
      key: 'request_id',
      label: 'リクエストID',
      className: 'w-[120px]',
      render: (row) => (
        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[120px]">
          {row.request_id ?? '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">監査ログ</h1>
        <p className="mt-1 text-sm text-gray-500">
          システム上の操作履歴を確認できます
        </p>
      </div>

      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="rounded-lg border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">開始日</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">終了日</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">操作</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="すべて" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">対象エンティティ</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="すべて" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={fetchLogs} size="sm">
              <Search className="mr-1 h-4 w-4" />
              検索
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1 h-4 w-4" />
              リセット
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border bg-white">
          <DataTable
            columns={columns}
            data={logs}
            pageSize={25}
            emptyMessage="監査ログが見つかりません"
          />
        </div>
      )}
    </div>
  );
}
