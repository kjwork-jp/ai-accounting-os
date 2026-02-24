'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import type { Partner, PartnerCategory } from '@/types/database';

interface PartnerFormProps {
  partner?: Partner | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function PartnerForm({ partner, onSaved, onCancel }: PartnerFormProps) {
  const isEditing = !!partner;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(partner?.name ?? '');
  const [nameKana, setNameKana] = useState(partner?.name_kana ?? '');
  const [category, setCategory] = useState<PartnerCategory>(partner?.category ?? 'customer');
  const [registrationNumber, setRegistrationNumber] = useState(partner?.registration_number ?? '');
  const [address, setAddress] = useState(partner?.address ?? '');
  const [phone, setPhone] = useState(partner?.phone ?? '');
  const [email, setEmail] = useState(partner?.email ?? '');
  const [bankInfo, setBankInfo] = useState(partner?.bank_info ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      name,
      name_kana: nameKana || null,
      category,
      registration_number: registrationNumber || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      bank_info: bankInfo || null,
      ...(isEditing ? { updated_at: partner.updated_at } : {}),
    };

    try {
      const url = isEditing ? `/api/v1/partners/${partner.id}` : '/api/v1/partners';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message || '保存に失敗しました');
        return;
      }

      // Show warning for similar partners
      if (json.warnings?.similar_partners?.length > 0) {
        const names = json.warnings.similar_partners.map((p: { name: string }) => p.name).join(', ');
        toast.warning(`類似する取引先があります: ${names}`);
      }

      toast.success(isEditing ? '取引先を更新しました' : '取引先を作成しました');
      onSaved?.();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">
        {isEditing ? '取引先の編集' : '取引先の新規作成'}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">取引先名 *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="name_kana">カナ</Label>
            <Input id="name_kana" value={nameKana} onChange={(e) => setNameKana(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="category">区分 *</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as PartnerCategory)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="customer">顧客</option>
              <option value="supplier">仕入先</option>
              <option value="both">両方</option>
            </select>
          </div>
          <div>
            <Label htmlFor="registration_number">登録番号</Label>
            <Input id="registration_number" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">メール</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="phone">電話番号</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">住所</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="bank_info">銀行口座情報</Label>
            <Input id="bank_info" value={bankInfo} onChange={(e) => setBankInfo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              キャンセル
            </Button>
          )}
          <Button type="submit" disabled={loading || !name}>
            {loading ? '保存中...' : (isEditing ? '更新' : '作成')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
