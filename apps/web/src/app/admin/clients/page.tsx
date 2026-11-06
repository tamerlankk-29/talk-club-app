'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Search, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ClientFormDrawer } from '@/components/admin/client-form';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, ErrorState } from '@/components/ui/feedback';
import { Input } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/layout';
import { toastError } from '@/components/ui/toast';
import { api, call, downloadFile } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminLevels, useAdminTags, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { CATEGORY_LABELS } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { clientsMessages } from '@/lib/i18n/messages/admin/clients';

type Row = S<'ClientListItemDto'>;
type Category = S<'ClientCategory'>;
const PAGE_SIZE = 25;

function MembershipCell({ m }: { m: Row['membership'] }) {
  const tr = useT(clientsMessages);
  if (!m) return <span className="text-sm text-subtle">{tr.noMembership}</span>;
  const low = m.visitsRemaining <= 1;
  return (
    <div className="text-sm">
      <p className="font-semibold">
        {m.planName} · <span className={low ? 'text-warning-700' : ''}>{tr.leftCount(m.visitsRemaining)}</span>
      </p>
      <p className="text-xs text-muted">{tr.untilDate(fmt.dateShort(m.expiresAt))}</p>
    </div>
  );
}

function ClientsList() {
  const tr = useT(clientsMessages);
  const router = useRouter();
  const url = useUrlState();
  const canManage = useCan('clients.manage');
  const canExport = useCan('data.export');
  const { data: levels } = useAdminLevels();
  const { data: tags } = useAdminTags();
  const { data: segments } = useQuery({ queryKey: adminKeys.segments, queryFn: () => call(api.GET('/api/admin/segments')), staleTime: 60_000 });
  const [q, setQ] = useState(url.get('q'));
  const [creating, setCreating] = useState(url.get('new') === '1');
  const page = Number(url.get('page', '1'));

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== url.get('q')) url.set({ q });
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = {
    q: url.get('q') || undefined,
    membership: (url.get('membership') || undefined) as 'active' | 'expiring' | 'expired' | 'none' | undefined,
    category: (url.get('category') || undefined) as Category | undefined,
    levelId: url.get('level') || undefined,
    tagId: url.get('tag') || undefined,
    segmentId: url.get('segment') || undefined,
    status: (url.get('status') || 'ACTIVE') as 'ACTIVE' | 'ARCHIVED' | 'ANONYMIZED',
    sort: (url.get('sort') || 'createdAt') as 'name' | 'createdAt' | 'lastVisitAt' | 'expiresAt',
  };
  const query = useQuery({
    queryKey: ['admin', 'clients', filters, page],
    queryFn: () => call(api.GET('/api/admin/clients', { params: { query: { ...filters, page, pageSize: PAGE_SIZE } } })),
    placeholderData: (prev) => prev,
  });

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: tr.client,
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.fullName} src={c.photoUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{c.fullName}</p>
            <p className="truncate text-xs text-muted">{fmt.phone(c.phone) || c.email || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'level',
      header: tr.level,
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-sm">
          <p>{c.level?.name ?? <span className="text-subtle">—</span>}</p>
          {c.category !== 'ADULT' && <p className="text-xs text-muted">{CATEGORY_LABELS[c.category]}</p>}
        </div>
      ),
    },
    { key: 'membership', header: tr.membership, cell: (c) => <MembershipCell m={c.membership} /> },
    {
      key: 'next',
      header: tr.nextSession,
      hideOnMobile: true,
      cell: (c) =>
        c.nextBooking ? (
          <div className="text-sm">
            <p className="font-medium">{fmt.weekdayDate(c.nextBooking.startsAt)}, {fmt.time(c.nextBooking.startsAt)}</p>
            <p className="text-xs text-muted">{c.nextBooking.teacherName ?? c.nextBooking.title}</p>
          </div>
        ) : (
          <span className="text-sm text-subtle">—</span>
        ),
    },
    {
      key: 'visits',
      header: tr.visits,
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-sm">
          <p className="font-semibold">{c.totalVisits}</p>
          <p className="text-xs text-muted">{c.lastVisitAt ? tr.lastVisitOn(fmt.dateShort(c.lastVisitAt)) : tr.never}</p>
        </div>
      ),
    },
    {
      key: 'tags',
      header: tr.tags,
      hideOnMobile: true,
      cell: (c) => (
        <div className="flex max-w-48 flex-wrap gap-1">
          {c.tags.slice(0, 3).map((t) => (
            <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${t.color ?? '#6d28d9'}1f`, color: t.color ?? '#6d28d9' }}>
              {t.name}
            </span>
          ))}
          {!c.hasAccount && <Badge>{tr.noApp}</Badge>}
        </div>
      ),
    },
  ];

  return (
    <AdminPage
      title={tr.clients}
      description={query.data ? tr.clientsCount(query.data.total) : tr.everyoneWhoVisited}
      actions={
        <>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => downloadFile('/api/admin/exports/clients?format=xlsx', 'clients.xlsx').catch(toastError)}
            >
              {tr.export}
            </Button>
          )}
          {canManage && (
            <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              {tr.newClient}
            </Button>
          )}
        </>
      }
    >
      <Toolbar>
        <div className="w-full sm:w-80">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.namePhoneEmail} leftIcon={<Search className="h-4 w-4" />} className="h-10" aria-label={tr.searchClients} />
        </div>
        <FilterSelect label={tr.membership} value={url.get('membership')} onChange={(v) => url.set({ membership: v })}>
          <option value="">{tr.anyMembership}</option>
          <option value="active">{tr.active}</option>
          <option value="expiring">{tr.expiringSoon}</option>
          <option value="expired">{tr.expiredUsedUp}</option>
          <option value="none">{tr.neverBought}</option>
        </FilterSelect>
        <FilterSelect label={tr.level} value={url.get('level')} onChange={(v) => url.set({ level: v })}>
          <option value="">{tr.anyLevel}</option>
          {levels?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={tr.category} value={url.get('category')} onChange={(v) => url.set({ category: v })}>
          <option value="">{tr.allCategories}</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={tr.tag} value={url.get('tag')} onChange={(v) => url.set({ tag: v })}>
          <option value="">{tr.anyTag}</option>
          {tags?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.clientCount})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={tr.segment} value={url.get('segment')} onChange={(v) => url.set({ segment: v })}>
          <option value="">{tr.anySegment}</option>
          {segments?.map((sg) => (
            <option key={sg.id} value={sg.id}>
              {sg.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={tr.status} value={url.get('status', 'ACTIVE')} onChange={(v) => url.set({ status: v === 'ACTIVE' ? null : v })}>
          <option value="ACTIVE">{tr.active}</option>
          <option value="ARCHIVED">{tr.archived}</option>
          <option value="ANONYMIZED">{tr.anonymized}</option>
        </FilterSelect>
        <FilterSelect label={tr.sort} value={url.get('sort', 'createdAt')} onChange={(v) => url.set({ sort: v === 'createdAt' ? null : v })}>
          <option value="createdAt">{tr.newestFirst}</option>
          <option value="name">{tr.name}</option>
          <option value="lastVisitAt">{tr.lastVisit}</option>
          <option value="expiresAt">{tr.membershipExpiry}</option>
        </FilterSelect>
      </Toolbar>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data?.items}
            rowKey={(c) => c.id}
            loading={query.isLoading}
            onRowClick={(c) => router.push(`/admin/clients/${c.id}`)}
            empty={<p className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-muted">{tr.noClientsMatchThese}</p>}
          />
          {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onChange={(p) => url.set({ page: p })} />}
        </>
      )}

      <ClientFormDrawer
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open && url.get('new')) url.set({ new: null });
        }}
        onSaved={(c) => router.push(`/admin/clients/${c.profile.id}`)}
      />
    </AdminPage>
  );
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsList />
    </Suspense>
  );
}
