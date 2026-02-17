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
import { UserPlus, Loader2, MoreHorizontal } from 'lucide-react';
import type { UserRole } from '@/types/database';

interface TenantUserRow {
  user_id: string;
  tenant_id: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理者',
  accounting: '経理',
  viewer: '閲覧者',
  approver: '承認者',
  sales: '営業',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800',
  accounting: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-800',
  approver: 'bg-amber-100 text-amber-800',
  sales: 'bg-green-100 text-green-800',
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('viewer');
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<TenantUserRow | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('viewer');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/users');
      const json = await res.json();
      if (json.data) setUsers(json.data);
      else if (json.error) setError(json.error.message ?? 'ユーザーの取得に失敗しました');
    } catch {
      setError('ユーザーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createEmail,
          full_name: createName,
          role: createRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? 'ユーザーの作成に失敗しました');
        return;
      }
      setCreateOpen(false);
      setCreateEmail('');
      setCreateName('');
      setCreateRole('viewer');
      fetchUsers();
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateRole() {
    if (!editUser) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/users/${editUser.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? 'ロールの更新に失敗しました');
        return;
      }
      setEditOpen(false);
      setEditUser(null);
      fetchUsers();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user: TenantUserRow) {
    setError('');
    if (user.is_active) {
      // Disable
      const res = await fetch(`/api/v1/users/${user.user_id}/disable`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? '無効化に失敗しました');
        return;
      }
    } else {
      // Re-enable
      const res = await fetch(`/api/v1/users/${user.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? '有効化に失敗しました');
        return;
      }
    }
    fetchUsers();
  }

  const columns: Column<TenantUserRow>[] = [
    {
      key: 'name',
      label: '名前',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">
            {row.profiles?.full_name ?? '(未設定)'}
          </div>
          <div className="text-sm text-muted-foreground">
            {row.profiles?.email ?? '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'ロール',
      sortable: true,
      render: (row) => (
        <Badge className={ROLE_COLORS[row.role]} variant="secondary">
          {ROLE_LABELS[row.role]}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      label: 'ステータス',
      render: (row) => (
        <Badge variant={row.is_active ? 'default' : 'outline'}>
          {row.is_active ? '有効' : '無効'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: '登録日',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString('ja-JP')}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-[100px]',
      render: (row) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditUser(row);
              setEditRole(row.role);
              setEditOpen(true);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
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
        <p className="text-sm text-muted-foreground">
          テナントに所属するユーザーの一覧と管理
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          ユーザー追加
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
            data={users}
            pageSize={20}
            emptyMessage="ユーザーが見つかりません"
          />
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザー追加</DialogTitle>
            <DialogDescription>
              既にサインアップ済みのユーザーをテナントに追加します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">メールアドレス</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="user@example.com"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">氏名</Label>
              <Input
                id="create-name"
                placeholder="山田 太郎"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ロール</Label>
              <Select value={createRole} onValueChange={v => setCreateRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createEmail || !createName}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザー編集</DialogTitle>
            <DialogDescription>
              {editUser?.profiles?.full_name ?? editUser?.profiles?.email ?? 'ユーザー'}
              の設定を変更します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ロール</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editUser && (
              <div className="space-y-2">
                <Label>アカウント状態</Label>
                <div>
                  <Button
                    variant={editUser.is_active ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => {
                      handleToggleActive(editUser);
                      setEditOpen(false);
                    }}
                  >
                    {editUser.is_active ? 'アカウントを無効化' : 'アカウントを有効化'}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleUpdateRole} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
