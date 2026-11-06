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

type Row = S<'ClientListItemDto'>;
type Category = S<'ClientCategory'>;
const PAGE_SIZE = 25;

function MembershipCell({ m }: { m: Row['membership'] }) {
  if (!m) return <span className="text-sm text-subtle">No membership</span>;
  const low = m.visitsRemaining <= 1;
  return (
    <div className="text-sm">
      <p className="font-semibold">
        {m.planName} · <span className={low ? 'text-warning-700' : ''}>{m.visitsRemaining} left</span>
      </p>
      <p className="text-xs text-muted">until {fmt.dateShort(m.expiresAt)}</p>
    </div>
  );
}

function ClientsList() {
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
      header: 'Client',
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
      header: 'Level',
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-sm">
          <p>{c.level?.name ?? <span className="text-subtle">—</span>}</p>
          {c.category !== 'ADULT' && <p className="text-xs text-muted">{CATEGORY_LABELS[c.category]}</p>}
        </div>
      ),
    },
    { key: 'membership', header: 'Membership', cell: (c) => <MembershipCell m={c.membership} /> },
    {
      key: 'next',
      header: 'Next session',
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
      header: 'Visits',
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-sm">
          <p className="font-semibold">{c.totalVisits}</p>
          <p className="text-xs text-muted">{c.lastVisitAt ? `last ${fmt.dateShort(c.lastVisitAt)}` : 'never'}</p>
        </div>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      hideOnMobile: true,
      cell: (c) => (
        <div className="flex max-w-48 flex-wrap gap-1">
          {c.tags.slice(0, 3).map((t) => (
            <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${t.color ?? '#6d28d9'}1f`, color: t.color ?? '#6d28d9' }}>
              {t.name}
            </span>
          ))}
          {!c.hasAccount && <Badge>no app</Badge>}
        </div>
      ),
    },
  ];

  return (
    <AdminPage
      title="Clients"
      description={query.data ? `${query.data.total} clients` : 'Everyone who has visited, bought or registered'}
      actions={
        <>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => downloadFile('/api/admin/exports/clients?format=xlsx', 'clients.xlsx').catch(toastError)}
            >
              Export
            </Button>
          )}
          {canManage && (
            <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New client
            </Button>
          )}
        </>
      }
    >
      <Toolbar>
        <div className="w-full sm:w-80">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" leftIcon={<Search className="h-4 w-4" />} className="h-10" aria-label="Search clients" />
        </div>
        <FilterSelect label="Membership" value={url.get('membership')} onChange={(v) => url.set({ membership: v })}>
          <option value="">Any membership</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired / used up</option>
          <option value="none">Never bought</option>
        </FilterSelect>
        <FilterSelect label="Level" value={url.get('level')} onChange={(v) => url.set({ level: v })}>
          <option value="">Any level</option>
          {levels?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Category" value={url.get('category')} onChange={(v) => url.set({ category: v })}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Tag" value={url.get('tag')} onChange={(v) => url.set({ tag: v })}>
          <option value="">Any tag</option>
          {tags?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.clientCount})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Segment" value={url.get('segment')} onChange={(v) => url.set({ segment: v })}>
          <option value="">Any segment</option>
          {segments?.map((sg) => (
            <option key={sg.id} value={sg.id}>
              {sg.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" value={url.get('status', 'ACTIVE')} onChange={(v) => url.set({ status: v === 'ACTIVE' ? null : v })}>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="ANONYMIZED">Anonymized</option>
        </FilterSelect>
        <FilterSelect label="Sort" value={url.get('sort', 'createdAt')} onChange={(v) => url.set({ sort: v === 'createdAt' ? null : v })}>
          <option value="createdAt">Newest first</option>
          <option value="name">Name</option>
          <option value="lastVisitAt">Last visit</option>
          <option value="expiresAt">Membership expiry</option>
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
            empty={<p className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-muted">No clients match these filters.</p>}
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
