'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/feedback';
import { Input } from '@/components/ui/inputs';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { adminCommonMessages } from '@/lib/i18n/messages/admin/common';

export interface PickedClient {
  id: string;
  name: string;
  phone: string | null;
  membership?: string | null;
}

/** Type-ahead client search (name / phone / email). */
export function ClientPicker({ value, onChange, autoFocus }: { value: PickedClient | null; onChange: (client: PickedClient | null) => void; autoFocus?: boolean }) {
  const m = useT(adminCommonMessages);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'clients', 'picker', term],
    queryFn: () => call(api.GET('/api/admin/clients', { params: { query: { q: term, pageSize: 8 } } })),
    enabled: term.length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-3">
        <Avatar name={value.name} size="sm" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{value.name}</p>
          <p className="text-xs text-muted">{[fmt.phone(value.phone), value.membership].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => onChange(null)}>
          {m.change}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={m.pickerPlaceholder} leftIcon={<Search className="h-4 w-4" />} autoFocus={autoFocus} aria-label={m.findClient} />
      {term.length >= 2 && (
        <div className="max-h-64 overflow-y-auto rounded-2xl border border-line">
          {isFetching && !data ? (
            <p className="p-3 text-sm text-muted">{m.searching}</p>
          ) : data?.items.length ? (
            data.items.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  onChange({
                    id: c.id,
                    name: c.fullName,
                    phone: c.phone,
                    membership: c.membership ? m.left(c.membership.planName, c.membership.visitsRemaining) : m.noMembership,
                  })
                }
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-50', i > 0 && 'border-t border-line/70')}
              >
                <Avatar name={c.fullName} src={c.photoUrl} size="sm" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-semibold">{c.fullName}</span>
                  <span className="block truncate text-xs text-muted">
                    {fmt.phone(c.phone) || c.email} · {c.membership ? m.leftShort(c.membership.planName, c.membership.visitsRemaining) : m.noMembershipLower}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted">{m.noClients}</p>
          )}
        </div>
      )}
    </div>
  );
}
