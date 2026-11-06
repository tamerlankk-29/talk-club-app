'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Download, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { Suspense, useEffect, useState } from 'react';
import { ClientPicker, type PickedClient } from '@/components/admin/client-picker';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { ConfirmPaymentDialog, PaymentReasonDialog, PaymentRequestDrawer } from '@/components/admin/payment-dialogs';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Input } from '@/components/ui/inputs';
import { DataTable, KeyValue, Pagination, StatCard, type Column } from '@/components/ui/layout';
import { Drawer, Modal } from '@/components/ui/overlay';
import { toastError } from '@/components/ui/toast';
import { api, call, downloadFile } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminMethods, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { CLUB_TZ, fmt } from '@/lib/format';

type Payment = S<'AdminPaymentDto'>;
const PAGE_SIZE = 50;

function Payments() {
  const url = useUrlState();
  const canManage = useCan('payments.manage');
  const canExportData = useCan('data.export');
  const canFinance = useCan('finance.view');
  const canExport = canExportData && canFinance;
  const { data: methods } = useAdminMethods();
  const page = Number(url.get('page', '1'));
  const [q, setQ] = useState(url.get('q'));
  const [picking, setPicking] = useState(url.get('new') === '1');
  const [requestFor, setRequestFor] = useState<PickedClient | null>(null);
  const openId = url.get('id') || null;
  useEffect(() => {
    const t = setTimeout(() => q !== url.get('q') && url.set({ q }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromDay = url.get('from');
  const toDay = url.get('to');
  const filters = {
    status: (url.get('status') || undefined) as S<'PaymentStatus'> | undefined,
    productType: (url.get('product') || undefined) as S<'ProductType'> | undefined,
    methodCode: url.get('method') || undefined,
    q: url.get('q') || undefined,
    from: fromDay ? DateTime.fromISO(fromDay, { zone: CLUB_TZ }).startOf('day').toUTC().toISO()! : undefined,
    to: toDay ? DateTime.fromISO(toDay, { zone: CLUB_TZ }).endOf('day').toUTC().toISO()! : undefined,
  };
  const query = useQuery({
    queryKey: ['admin', 'payments', filters, page],
    queryFn: () => call(api.GET('/api/admin/payments', { params: { query: { ...filters, page, pageSize: PAGE_SIZE } } })),
    placeholderData: (prev) => prev,
  });

  const columns: Column<Payment>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: (p) => (
        <div>
          <p className="font-semibold">{p.client.name}</p>
          <p className="text-xs text-muted">{p.description ?? p.plan?.name ?? p.productType.toLowerCase()}</p>
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', cell: (p) => <span className="font-display font-semibold">{fmt.money(p.amount)}</span> },
    { key: 'method', header: 'Method', hideOnMobile: true, cell: (p) => <span className="text-sm">{p.method.name}{p.reference ? <span className="block text-xs text-muted">#{p.reference}</span> : null}</span> },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'date', header: 'Date', hideOnMobile: true, cell: (p) => <span className="text-sm text-muted">{fmt.dateTime(p.paidAt ?? p.createdAt)}</span> },
  ];

  return (
    <AdminPage
      title="Payments"
      description="Kaspi invoices, cash and card payments. Confirming a pending payment activates the membership."
      actions={
        <>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => downloadFile(`/api/admin/exports/payments?format=xlsx${filters.from ? `&from=${filters.from}` : ''}${filters.to ? `&to=${filters.to}` : ''}`, 'payments.xlsx').catch(toastError)}
            >
              Export
            </Button>
          )}
          {canManage && (
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
              Payment request
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid (filtered)" loading={!query.data} value={fmt.money(query.data?.totalPaid ?? 0)} tone="success" icon={<CircleCheck className="h-5 w-5" />} />
        <StatCard label="Awaiting payment" loading={!query.data} value={fmt.money(query.data?.totalPending ?? 0)} tone="warning" hint="Pending requests" />
        <StatCard label="Payments" loading={!query.data} value={query.data?.total ?? 0} />
      </div>
      <Toolbar>
        <div className="w-full sm:w-72">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, phone or reference" leftIcon={<Search className="h-4 w-4" />} className="h-10" aria-label="Search payments" />
        </div>
        <FilterSelect label="Status" value={url.get('status')} onChange={(v) => url.set({ status: v })}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REFUNDED">Refunded</option>
          <option value="PARTIALLY_REFUNDED">Partly refunded</option>
        </FilterSelect>
        <FilterSelect label="Product" value={url.get('product')} onChange={(v) => url.set({ product: v })}>
          <option value="">All products</option>
          <option value="MEMBERSHIP">Memberships</option>
          <option value="TRIAL">Trials</option>
          <option value="OTHER">Other</option>
        </FilterSelect>
        <FilterSelect label="Method" value={url.get('method')} onChange={(v) => url.set({ method: v })}>
          <option value="">All methods</option>
          {methods?.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </FilterSelect>
        <Input type="date" value={fromDay} onChange={(e) => url.set({ from: e.target.value })} className="h-10 w-40" aria-label="From" />
        <Input type="date" value={toDay} onChange={(e) => url.set({ to: e.target.value })} className="h-10 w-40" aria-label="To" />
      </Toolbar>
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={query.data?.items} rowKey={(p) => p.id} loading={query.isLoading} onRowClick={(p) => url.set({ id: p.id, page })} />
          {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onChange={(p) => url.set({ page: p })} />}
        </>
      )}

      <PaymentDrawer id={openId} onClose={() => url.set({ id: null, page })} />
      <Modal
        open={picking}
        onOpenChange={(o) => {
          setPicking(o);
          if (!o && url.get('new')) url.set({ new: null });
        }}
        title="Payment request for…"
        size="sm"
      >
        <ClientPicker
          value={null}
          autoFocus
          onChange={(c) => {
            setPicking(false);
            setRequestFor(c);
          }}
        />
      </Modal>
      {requestFor && <PaymentRequestDrawer open onOpenChange={(o) => !o && setRequestFor(null)} clientId={requestFor.id} clientName={requestFor.name} />}
    </AdminPage>
  );
}

function PaymentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const canManage = useCan('payments.manage');
  const canRefund = useCan('payments.refund');
  const [dialog, setDialog] = useState<'confirm' | 'cancel' | 'refund' | null>(null);
  const { data: p } = useQuery({
    queryKey: ['admin', 'payments', 'one', id],
    queryFn: () => call(api.GET('/api/admin/payments/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
  });
  const refundable = p ? p.amount - p.refundedAmount : 0;
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={p ? fmt.money(p.amount) : 'Payment'} description={p?.description ?? undefined}>
      {!p ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <Badge>{p.productType.toLowerCase()}</Badge>
            {p.provider !== 'manual' && <Badge tone="info">{p.provider}</Badge>}
          </div>
          <KeyValue
            items={[
              {
                label: 'Client',
                value: (
                  <Link href={`/admin/clients/${p.client.id}?tab=payments`} className="text-brand-700">
                    {p.client.name}
                  </Link>
                ),
              },
              { label: 'Method', value: p.method.name },
              ...(p.plan ? [{ label: 'Plan', value: `${p.plan.name} (${p.plan.visits} visits, ${p.plan.validityDays} days)` }] : []),
              { label: 'Reference', value: p.reference ?? '—' },
              { label: 'Created', value: `${fmt.dateTime(p.createdAt)}${p.createdBy ? ` · ${p.createdBy.name}` : ' · by client'}` },
              ...(p.paidAt ? [{ label: 'Paid', value: `${fmt.dateTime(p.paidAt)}${p.confirmedBy ? ` · ${p.confirmedBy.name}` : ''}` }] : []),
              ...(p.cancelledAt ? [{ label: 'Cancelled', value: fmt.dateTime(p.cancelledAt) }] : []),
              ...(p.failureReason ? [{ label: 'Reason', value: p.failureReason }] : []),
              ...(p.refundedAmount ? [{ label: 'Refunded', value: `${fmt.money(p.refundedAmount)}${p.refundedAt ? ` · ${fmt.date(p.refundedAt)}` : ''}${p.refundReason ? ` · ${p.refundReason}` : ''}` }] : []),
              ...(p.membershipId ? [{ label: 'Membership', value: <Link href={`/admin/clients/${p.client.id}?tab=memberships`} className="text-brand-700">Open</Link> }] : []),
            ]}
          />
          {p.notes && <p className="rounded-2xl bg-canvas p-3 text-sm">{p.notes}</p>}
          <div className="flex flex-wrap gap-2">
            {canManage && p.status === 'PENDING' && (
              <>
                <Button onClick={() => setDialog('confirm')}>Confirm payment</Button>
                <Button variant="ghost" className="text-danger-700" onClick={() => setDialog('cancel')}>
                  Cancel request
                </Button>
              </>
            )}
            {canRefund && (p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') && refundable > 0 && (
              <Button variant="outline" onClick={() => setDialog('refund')}>
                Refund
              </Button>
            )}
          </div>
          {dialog === 'confirm' && <ConfirmPaymentDialog payment={p} open onOpenChange={(o) => !o && setDialog(null)} />}
          {(dialog === 'cancel' || dialog === 'refund') && <PaymentReasonDialog payment={p} mode={dialog} open onOpenChange={(o) => !o && setDialog(null)} />}
        </div>
      )}
    </Drawer>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <Payments />
    </Suspense>
  );
}
