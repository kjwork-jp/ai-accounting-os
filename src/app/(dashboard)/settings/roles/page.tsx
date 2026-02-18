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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { UserRole } from '@/types/database';

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  base_role: UserRole;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

const BASE_ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理者',
  accounting: '経理',
  viewer: '閲覧者',
  approver: '承認者',
  sales: '営業',
};

const PERMISSION_OPTIONS = [
  { value: 'users:manage', label: 'ユーザー管理' },
  { value: 'tenant:settings', label: 'テナント設定' },
  { value: 'custom_roles:manage', label: 'カスタムロール管理' },
  { value: 'documents:upload', label: '証憑アップロード' },
  { value: 'documents:view', label: '証憑閲覧' },
  { value: 'journals:confirm', label: '仕訳確定' },
  { value: 'journals:view', label: '仕訳閲覧' },
  { value: 'partners:manage', label: '取引先管理' },
  { value: 'partners:view', label: '取引先閲覧' },
  { value: 'orders:manage', label: '受発注管理' },
  { value: 'invoices:manage', label: '請求書管理' },
  { value: 'approvals:create', label: '決裁申請' },
  { value: 'approvals:approve', label: '決裁承認' },
  { value: 'approvals:view', label: '決裁閲覧' },
  { value: 'reports:view', label: 'レポート閲覧' },
  { value: 'audit:view', label: '監査ログ閲覧' },
];

export default function CustomRolesPage() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBaseRole, setFormBaseRole] = useState<UserRole>('viewer');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/custom-roles');
      const json = await res.json();
      if (json.data) setRoles(json.data);
    } catch {
      setError('カスタムロールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  function openCreate() {
    setEditingRole(null);
    setFormName('');
    setFormDescription('');
    setFormBaseRole('viewer');
    setFormPermissions([]);
    setDialogOpen(true);
  }

  function openEdit(role: CustomRole) {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description ?? '');
    setFormBaseRole(role.base_role);
    setFormPermissions(role.permissions);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: formName,
        description: formDescription || undefined,
        base_role: formBaseRole,
        permissions: formPermissions,
      };

      const url = editingRole
        ? `/api/v1/custom-roles/${editingRole.id}`
        : '/api/v1/custom-roles';

      const res = await fetch(url, {
        method: editingRole ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? '保存に失敗しました');
        return;
      }

      setDialogOpen(false);
      fetchRoles();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(roleId: string) {
    if (!confirm('このカスタムロールを削除しますか？')) return;
    const res = await fetch(`/api/v1/custom-roles/${roleId}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error?.message ?? '削除に失敗しました');
      return;
    }
    fetchRoles();
  }

  function togglePermission(perm: string) {
    setFormPermissions(prev =>
      prev.includes(perm)
        ? prev.filter(p => p !== perm)
        : [...prev, perm]
    );
  }

  const columns: Column<CustomRole>[] = [
    {
      key: 'name',
      label: 'ロール名',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          {row.description && (
            <div className="text-xs text-muted-foreground">{row.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'base_role',
      label: 'ベースロール',
      render: (row) => (
        <Badge variant="secondary">{BASE_ROLE_LABELS[row.base_role]}</Badge>
      ),
    },
    {
      key: 'permissions',
      label: '追加権限',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.permissions.length === 0 ? (
            <span className="text-xs text-muted-foreground">なし</span>
          ) : (
            row.permissions.map(p => {
              const opt = PERMISSION_OPTIONS.find(o => o.value === p);
              return (
                <Badge key={p} variant="outline" className="text-xs">
                  {opt?.label ?? p}
                </Badge>
              );
            })
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-[100px]',
      render: (row) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            基本ロール（管理者・経理・閲覧者・承認者・営業）に加えて、テナント固有のカスタムロールを定義できます。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            カスタムロールはベースロールの権限に追加権限を付与します。
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          カスタムロール作成
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border bg-white">
          <DataTable
            columns={columns}
            data={roles}
            pageSize={20}
            emptyMessage="カスタムロールが定義されていません"
          />
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'カスタムロール編集' : 'カスタムロール作成'}
            </DialogTitle>
            <DialogDescription>
              ベースロールに追加の権限を付与したカスタムロールを定義します。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ロール名</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="例: 経理マネージャー"
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label>説明（任意）</Label>
              <Input
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="例: 経理権限＋承認権限"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>ベースロール</Label>
              <Select value={formBaseRole} onValueChange={v => setFormBaseRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BASE_ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>追加権限</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto rounded border p-3">
                {PERMISSION_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPermissions.includes(opt.value)}
                      onChange={() => togglePermission(opt.value)}
                      className="rounded border-gray-300"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRole ? '更新' : '作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
