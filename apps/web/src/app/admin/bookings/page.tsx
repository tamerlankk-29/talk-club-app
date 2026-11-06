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
import { useT } from '@/lib/i18n';
import { scheduleMessages } from '@/lib/i18n/messages/admin/schedule';

type Row = S<'AdminBookingRowDto'>;
const PAGE_SIZE = 50;

function Bookings() {
  const tr = useT(scheduleMessages);
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
      header: tr.session,
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
      header: tr.client,
      cell: (b) => (
        <div>
          <p className="font-medium">{b.client.name}</p>
          <p className="text-xs text-muted">{fmt.phone(b.client.phone)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: tr.status,
      cell: (b) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={b.status} />
          {b.kind !== 'MEMBERSHIP' && <Badge tone="zest">{tr.bookingKinds[b.kind] ?? b.kind.toLowerCase()}</Badge>}
        </div>
      ),
    },
    { key: 'membership', header: tr.membership, hideOnMobile: true, cell: (b) => <span className="text-sm">{b.membershipName ?? '—'}{b.visitReturned ? ' · returned' : ''}</span> },
    { key: 'booked', header: tr.booked, hideOnMobile: true, cell: (b) => <span className="text-sm text-muted">{fmt.dateTime(b.bookedAt)} · {b.source.toLowerCase()}</span> },
  ];
  return (
    <AdminPage
      title={tr.bookings}
      description={query.data ? tr.bookingsInPeriod(query.data.total) : undefined}
      actions={
        canExport && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => downloadFile(`/api/admin/exports/bookings?format=xlsx&from=${filters.from}&to=${filters.to}`, 'bookings.xlsx').catch(toastError)}
          >
            {tr.export}
          </Button>
        )
      }
    >
      <Toolbar>
        <Input type="date" value={fromDay} onChange={(e) => url.set({ from: e.target.value })} className="h-10 w-40" aria-label={tr.from} />
        <span className="text-muted">–</span>
        <Input type="date" value={toDay} onChange={(e) => url.set({ to: e.target.value })} className="h-10 w-40" aria-label={tr.to} />
        <FilterSelect label={tr.status} value={url.get('status')} onChange={(v) => url.set({ status: v })}>
          <option value="">{tr.allStatuses}</option>
          <option value="BOOKED">{tr.booked}</option>
          <option value="ATTENDED">{tr.attended}</option>
          <option value="NO_SHOW">{tr.noShow}</option>
          <option value="CANCELLED">{tr.cancelled}</option>
          <option value="LATE_CANCELLED">{tr.lateCancelled}</option>
        </FilterSelect>
        <FilterSelect label={tr.type} value={url.get('kind')} onChange={(v) => url.set({ kind: v })}>
          <option value="">{tr.allTypes}</option>
          <option value="MEMBERSHIP">{tr.membership}</option>
          <option value="TRIAL">{tr.trial}</option>
          <option value="COMPLIMENTARY">{tr.complimentary}</option>
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
