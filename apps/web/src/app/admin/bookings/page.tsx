'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, StatusBadge } from '@/components/ui/feedback';
import { Input } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/layout';
import { toastError } from '@/components/ui/toast';
import { api, call, downloadFile } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { clubNow, CLUB_TZ, fmt } from '@/lib/format';
import { DateTime } from 'luxon';

type Row = S<'AdminBookingRowDto'>;
const PAGE_SIZE = 50;

function Bookings() {
  const router = useRouter();
  const url = useUrlState();
  const canExport = useCan('data.export');
  const page = Number(url.get('page', '1'));
  const fromDay = url.get('from', clubNow().minus({ days: 7 }).toISODate()!);
  const toDay = url.get('to', clubNow().plus({ days: 14 }).toISODate()!);
  const filters = {
    status: (url.get('status') || undefined) as S<'BookingStatus'> | undefined,
    kind: (url.get('kind') || undefined) as S<'BookingKind'> | undefined,
    from: DateTime.fromISO(fromDay, { zone: CLUB_TZ }).startOf('day').toUTC().toISO()!,
    to: DateTime.fromISO(toDay, { zone: CLUB_TZ }).endOf('day').toUTC().toISO()!,
  };
  const query = useQuery({
    queryKey: ['admin', 'bookings', filters, page],
    queryFn: () => call(api.GET('/api/admin/bookings', { params: { query: { ...filters, page, pageSize: PAGE_SIZE } } })),
    placeholderData: (prev) => prev,
  });
  const columns: Column<Row>[] = [
    {
      key: 'when',
      header: 'Session',
      cell: (b) => (
        <div>
          <p className="font-semibold">
            {fmt.weekdayDate(b.session.startsAt)}, {b.session.startTime}
          </p>
          <p className="text-xs text-muted">
            {b.session.title} · {b.session.teacher?.name ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      cell: (b) => (
        <div>
          <p className="font-medium">{b.client.name}</p>
          <p className="text-xs text-muted">{fmt.phone(b.client.phone)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (b) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={b.status} />
          {b.kind !== 'MEMBERSHIP' && <Badge tone="zest">{b.kind.toLowerCase()}</Badge>}
        </div>
      ),
    },
    { key: 'membership', header: 'Membership', hideOnMobile: true, cell: (b) => <span className="text-sm">{b.membershipName ?? '—'}{b.visitReturned ? ' · returned' : ''}</span> },
    { key: 'booked', header: 'Booked', hideOnMobile: true, cell: (b) => <span className="text-sm text-muted">{fmt.dateTime(b.bookedAt)} · {b.source.toLowerCase()}</span> },
  ];
  return (
    <AdminPage
      title="Bookings"
      description={query.data ? `${query.data.total} bookings in the selected period` : undefined}
      actions={
        canExport && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => downloadFile(`/api/admin/exports/bookings?format=xlsx&from=${filters.from}&to=${filters.to}`, 'bookings.xlsx').catch(toastError)}
          >
            Export
          </Button>
        )
      }
    >
      <Toolbar>
        <Input type="date" value={fromDay} onChange={(e) => url.set({ from: e.target.value })} className="h-10 w-40" aria-label="From" />
        <span className="text-muted">–</span>
        <Input type="date" value={toDay} onChange={(e) => url.set({ to: e.target.value })} className="h-10 w-40" aria-label="To" />
        <FilterSelect label="Status" value={url.get('status')} onChange={(v) => url.set({ status: v })}>
          <option value="">All statuses</option>
          <option value="BOOKED">Booked</option>
          <option value="ATTENDED">Attended</option>
          <option value="NO_SHOW">No-show</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="LATE_CANCELLED">Late cancelled</option>
        </FilterSelect>
        <FilterSelect label="Type" value={url.get('kind')} onChange={(v) => url.set({ kind: v })}>
          <option value="">All types</option>
          <option value="MEMBERSHIP">Membership</option>
          <option value="TRIAL">Trial</option>
          <option value="COMPLIMENTARY">Complimentary</option>
        </FilterSelect>
      </Toolbar>
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={query.data?.items} rowKey={(b) => b.id} loading={query.isLoading} onRowClick={(b) => router.push(`/admin/sessions/${b.session.id}`)} />
          {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onChange={(p) => url.set({ page: p })} />}
        </>
      )}
    </AdminPage>
  );
}

export default function BookingsPage() {
  return (
    <Suspense>
      <Bookings />
    </Suspense>
  );
}
