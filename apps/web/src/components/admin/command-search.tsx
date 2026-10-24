'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, GraduationCap, KanbanSquare, Search, Ticket, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, statusLabel } from '@/components/ui/feedback';
import { Spinner } from '@/components/ui/button';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { messagesFor, useT } from '@/lib/i18n';
import { crmMessages } from '@/lib/i18n/messages/admin/crm';
import { adminCommonMessages } from '@/lib/i18n/messages/admin/common';

interface Hit {
  key: string;
  href: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Global search across clients, leads, teachers, payments and memberships (Ctrl/⌘ + K). */
export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const m = useT(adminCommonMessages);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const term = useDebounced(q.trim(), 200);
  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'search', term],
    queryFn: () => call(api.GET('/api/admin/search', { params: { query: { q: term } } })),
    enabled: open && term.length >= 2,
    staleTime: 10_000,
  });

  const hits = useMemo<Hit[]>(() => {
    if (!data) return [];
    return [
      ...data.clients.map((c) => ({
        key: `c${c.id}`,
        href: `/admin/clients/${c.id}`,
        icon: <UserRound className="h-4 w-4" />,
        title: c.name,
        subtitle: [fmt.phone(c.phone), c.level].filter(Boolean).join(' · '),
        badge: c.status !== 'ACTIVE' ? statusLabel(c.status) : undefined,
      })),
      ...data.leads.map((l) => ({ key: `l${l.id}`, href: `/admin/crm?lead=${l.id}`, icon: <KanbanSquare className="h-4 w-4" />, title: l.name, subtitle: fmt.phone(l.phone), badge: messagesFor(crmMessages).stages[l.stage] ?? l.stage })),
      ...data.teachers.map((t) => ({ key: `t${t.id}`, href: `/admin/teachers?id=${t.id}`, icon: <GraduationCap className="h-4 w-4" />, title: t.name, subtitle: m.teacher, badge: t.isActive ? undefined : m.inactive })),
      ...data.memberships.map((ms) => ({ key: `m${ms.id}`, href: `/admin/clients/${ms.client.id}?tab=memberships`, icon: <Ticket className="h-4 w-4" />, title: `${ms.planName} · ${ms.client.name}`, subtitle: m.visitsLeft(ms.visitsRemaining) })),
      ...data.payments.map((p) => ({ key: `p${p.id}`, href: `/admin/payments?id=${p.id}`, icon: <CreditCard className="h-4 w-4" />, title: `${fmt.money(p.amount)} · ${p.client}`, subtitle: p.reference ?? undefined, badge: statusLabel(p.status) })),
    ];
  }, [data, m]);

  useEffect(() => setCursor(0), [hits.length]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    onOpenChange(false);
    router.push(hit.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl bg-white shadow-float outline-none">
          <Dialog.Title className="sr-only">{m.search}</Dialog.Title>
          <Dialog.Description className="sr-only">{m.searchDescription}</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="h-5 w-5 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, hits.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === 'Enter') {
                  go(hits[cursor]);
                }
              }}
              placeholder={m.searchPlaceholder}
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
            />
            {isFetching && <Spinner className="h-4 w-4 text-brand-600" />}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {term.length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">{m.typeTwo}</p>
            ) : hits.length === 0 && !isFetching ? (
              <p className="px-3 py-6 text-center text-sm text-muted">{m.nothingFound(term)}</p>
            ) : (
              hits.map((h, i) => (
                <button
                  key={h.key}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(h)}
                  className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left', i === cursor && 'bg-brand-50')}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-canvas text-brand-700">{h.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
                  </span>
                  {h.badge && <Badge>{h.badge}</Badge>}
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
