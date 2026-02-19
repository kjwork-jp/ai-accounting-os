'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Account {
  code: string;
  name: string;
  category: string;
}

interface AccountSelectProps {
  value: string;
  onChange: (code: string, name: string) => void;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  asset: '資産',
  liability: '負債',
  equity: '純資産',
  revenue: '収益',
  expense: '費用',
};

export function AccountSelect({ value, onChange, disabled }: AccountSelectProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/v1/accounts')
      .then(r => r.json())
      .then(res => {
        if (res.data && Array.isArray(res.data)) {
          setAccounts(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const filtered = search
    ? accounts.filter(
        a =>
          a.code.includes(search) ||
          a.name.includes(search)
      )
    : accounts;

  const grouped = filtered.reduce<Record<string, Account[]>>((acc, account) => {
    const cat = account.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(account);
    return acc;
  }, {});

  return (
    <Select
      value={value}
      onValueChange={v => {
        const acct = accounts.find(a => a.code === v);
        onChange(v, acct?.name ?? v);
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="勘定科目を選択" />
      </SelectTrigger>
      <SelectContent>
        <div className="px-2 pb-2">
          <Input
            placeholder="科目コード・名称で検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        {Object.entries(grouped).map(([category, accts]) => (
          <SelectGroup key={category}>
            <SelectLabel>{CATEGORY_LABELS[category] ?? category}</SelectLabel>
            {accts.map(a => (
              <SelectItem key={a.code} value={a.code}>
                {a.code} {a.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
