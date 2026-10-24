'use client';

import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Suspense, useState } from 'react';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Input } from '@/components/ui/inputs';
import { Card, Pagination } from '@/components/ui/layout';
import { Drawer } from '@/components/ui/overlay';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useUrlState } from '@/lib/admin-queries';
import { CLUB_TZ, fmt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { reportsMessages } from '@/lib/i18n/messages/admin/reports';

type Entry = S<'AuditLogDto'>;
const PAGE_SIZE = 50;

const ENTITY_TYPES = ['Client', 'Booking', 'Membership', 'Payment', 'Session', 'SessionTemplate', 'MembershipPlan', 'Setting', 'User', 'Role', 'Teacher', 'Lead', 'Broadcast', 'AutomationRule', 'LegalDocument', 'DataRequest'];

function AuditLog() {
  const tr = useT(reportsMessages);
  const url = useUrlState();
  const page = Number(url.get('page', '1'));
  const [open, setOpen] = useState<Entry | null>(null);
  const fromDay = url.get('from');
  const toDay = url.get('to');
  const filters = {
    entityType: url.get('entity') || undefined,
    action: url.get('action') || undefined,
    entityId: url.get('entityId') || undefined,
    from: fromDay ? DateTime.fromISO(fromDay, { zone: CLUB_TZ }).startOf('day').toUTC().toISO()! : undefined,
    to: toDay ? DateTime.fromISO(toDay, { zone: CLUB_TZ }).endOf('day').toUTC().toISO()! : undefined,
  };
  const query = useQuery({
    queryKey: ['admin', 'audit', filters, page],
    queryFn: () => call(api.GET('/api/admin/audit-logs', { params: { query: { ...filters, page, pageSize: PAGE_SIZE } } })),
    placeholderData: (prev) => prev,
  });
  return (
    <AdminPage title={tr.auditLog} description={tr.everyChangeMembershipsPayments}>
      <Toolbar>
        <FilterSelect label={tr.entity} value={url.get('entity')} onChange={(v) => url.set({ entity: v })}>
          <option value="">{tr.allEntities}</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </FilterSelect>
        <Input className="h-10 w-56" placeholder={tr.actionEGMembership} value={url.get('action')} onChange={(e) => url.set({ action: e.target.value })} aria-label={tr.action} />
        <Input type="date" className="h-10 w-40" value={fromDay} onChange={(e) => url.set({ from: e.target.value })} aria-label={tr.from} />
        <Input type="date" className="h-10 w-40" value={toDay} onChange={(e) => url.set({ to: e.target.value })} aria-label={tr.to} />
      </Toolbar>
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <SkeletonList count={8} />
      ) : (
        <>
          <Card padded={false} className="divide-y divide-line/70">
            {query.data?.items.map((e) => (
              <button key={e.id} type="button" onClick={() => setOpen(e)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm hover:bg-brand-50/40">
                <span className="w-36 shrink-0 text-xs text-muted">{fmt.dateTime(e.createdAt)}</span>
                <span className="font-mono text-xs font-semibold text-brand-800">{e.action}</span>
                <span className="text-muted">
                  {e.entityType}
                  {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ''}
                </span>
                {e.reason && <span className="truncate text-muted">“{e.reason}”</span>}
                <span className="ml-auto text-xs font-medium">{e.actorLabel ?? tr.system}</span>
              </button>
            ))}
            {!query.data?.items.length && <p className="px-5 py-6 text-center text-sm text-muted">{tr.noEntries}</p>}
          </Card>
          {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.meta.total} onChange={(p) => url.set({ page: p })} />}
        </>
      )}
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.action ?? ''} description={open ? `${open.entityType} ${open.entityId ?? ''} · ${fmt.dateTime(open.createdAt)}` : undefined} width="lg">
        {open && (
          <div className="space-y-4 text-sm">
            <p>
              <span className="text-muted">{tr.by}</span> <span className="font-semibold">{open.actorLabel ?? tr.system}</span>
              {open.ip ? <span className="text-muted"> · {open.ip}</span> : null}
            </p>
            {open.reason && <p className="rounded-2xl bg-warning-50 p-3 text-warning-700">{tr.reasonLabel} {open.reason}</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{tr.before}</p>
                <pre className="max-h-[60vh] overflow-auto rounded-2xl bg-canvas p-3 text-xs">{JSON.stringify(open.oldValue, null, 2) ?? '—'}</pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{tr.after}</p>
                <pre className="max-h-[60vh] overflow-auto rounded-2xl bg-canvas p-3 text-xs">{JSON.stringify(open.newValue, null, 2) ?? '—'}</pre>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </AdminPage>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditLog />
    </Suspense>
  );
}
