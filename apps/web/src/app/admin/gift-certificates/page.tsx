'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus, Printer, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ClientPicker, type PickedClient } from '@/components/admin/client-picker';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { DataTable, KeyValue, Pagination, type Column } from '@/components/ui/layout';
import { Drawer, Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminMethods, useAdminPlans, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { giftMessages } from '@/lib/i18n/messages/admin/gifts';
import { membershipMessages, paymentMethodText } from '@/lib/i18n/messages/membership';

type Gift = S<'GiftCertificateDto'>;
const PAGE_SIZE = 50;

function GiftCertificates() {
  const tr = useT(giftMessages);
  const url = useUrlState();
  const canManage = useCan('payments.manage');
  const page = Number(url.get('page', '1'));
  const [q, setQ] = useState(url.get('q'));
  const [selling, setSelling] = useState(false);
  const openId = url.get('id') || null;
  useEffect(() => {
    const t = setTimeout(() => q !== url.get('q') && url.set({ q }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = { status: (url.get('status') || undefined) as Gift['status'] | undefined, q: url.get('q') || undefined };
  const query = useQuery({
    queryKey: ['admin', 'gift-certificates', filters, page],
    queryFn: () => call(api.GET('/api/admin/gift-certificates', { params: { query: { ...filters, page, pageSize: PAGE_SIZE } } })),
    placeholderData: (prev) => prev,
  });

  const columns: Column<Gift>[] = [
    { key: 'code', header: tr.code, cell: (g) => <span className="font-mono text-sm font-semibold">{g.code}</span> },
    {
      key: 'recipient',
      header: tr.recipient,
      cell: (g) => (
        <div>
          <p className="font-semibold">{g.recipientName ?? <span className="text-muted">{tr.noRecipient}</span>}</p>
          <p className="text-xs text-muted">{g.planName}</p>
        </div>
      ),
    },
    { key: 'buyer', header: tr.buyer, hideOnMobile: true, cell: (g) => <span className="text-sm">{g.buyer.name}</span> },
    { key: 'price', header: tr.price, hideOnMobile: true, cell: (g) => <span className="font-display font-semibold">{fmt.money(g.price)}</span> },
    { key: 'status', header: tr.allStatuses, cell: (g) => <StatusBadge status={g.status} label={tr.status[g.status]} /> },
    { key: 'expires', header: tr.redeemBy, hideOnMobile: true, cell: (g) => <span className="text-sm text-muted">{fmt.date(g.expiresAt)}</span> },
  ];

  return (
    <AdminPage
      title={tr.title}
      description={tr.description}
      actions={
        canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setSelling(true)}>
            {tr.sell}
          </Button>
        )
      }
    >
      <Toolbar>
        <div className="w-full sm:w-72">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.searchPlaceholder} leftIcon={<Search className="h-4 w-4" />} className="h-10" aria-label={tr.search} />
        </div>
        <FilterSelect label={tr.allStatuses} value={url.get('status')} onChange={(v) => url.set({ status: v, page: null })}>
          <option value="">{tr.allStatuses}</option>
          {(['ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED'] as const).map((s) => (
            <option key={s} value={s}>
              {tr.status[s]}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data?.items}
            rowKey={(g) => g.id}
            loading={query.isLoading}
            onRowClick={(g) => url.set({ id: g.id, page })}
            empty={<EmptyState icon={<Gift className="h-7 w-7" />} title={tr.empty} description={tr.emptyText} />}
          />
          {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.meta.total} onChange={(p) => url.set({ page: p })} />}
        </>
      )}
      <GiftDrawer id={openId} onClose={() => url.set({ id: null, page })} />
      {selling && <SellDrawer onClose={() => setSelling(false)} />}
    </AdminPage>
  );
}

function SellDrawer({ onClose }: { onClose: () => void }) {
  const tr = useT(giftMessages);
  const mt = useT(membershipMessages);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: plans } = useAdminPlans();
  const { data: methods } = useAdminMethods();
  const [buyer, setBuyer] = useState<PickedClient | null>(null);
  const [planId, setPlanId] = useState('');
  const [methodCode, setMethodCode] = useState('CASH');
  const [price, setPrice] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [days, setDays] = useState('180');
  const [reference, setReference] = useState('');
  const activePlans = (plans ?? []).filter((p) => p.isActive);
  const plan = activePlans.find((p) => p.id === planId);
  const deskMethods = (methods ?? []).filter((m) => m.isActive && m.provider === 'manual');

  const sell = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/gift-certificates', {
          body: {
            planId,
            buyerClientId: buyer!.id,
            methodCode,
            price: price ? Number(price) : undefined,
            recipientName: recipientName.trim() || undefined,
            message: message.trim() || undefined,
            redeemWithinDays: days ? Number(days) : undefined,
            reference: reference.trim() || undefined,
          },
        }),
      ),
    onSuccess: async (g) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'gift-certificates'] }), qc.invalidateQueries({ queryKey: ['admin', 'payments'] })]);
      toast.success(tr.sold_(g.code));
      onClose();
      router.push(`/print/gift-certificate/${g.id}`);
    },
  });
  const errors = fieldErrors(sell.error);

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.sell}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={sell.isPending} disabled={!buyer || !planId} onClick={() => sell.mutate()}>
            {tr.sellAndPrint}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.buyer} required hint={tr.buyerHint}>
          <ClientPicker value={buyer} onChange={setBuyer} />
        </Field>
        <Field label={tr.plan} required htmlFor="gc-plan" error={errors.planId}>
          <Select id="gc-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{tr.choosePlan}</option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {tr.planDetails(p.name, p.visits, p.validityDays)} · {fmt.money(p.price)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr.paidWith} htmlFor="gc-method">
            <Select id="gc-method" value={methodCode} onChange={(e) => setMethodCode(e.target.value)}>
              {deskMethods.map((m) => (
                <option key={m.code} value={m.code}>
                  {paymentMethodText(mt.methods, m).name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.price} htmlFor="gc-price" hint={tr.priceHint} error={errors.price}>
            <Input id="gc-price" type="number" min={0} inputMode="numeric" value={price} placeholder={plan ? String(plan.price) : ''} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <Field label={tr.recipientName} htmlFor="gc-recipient" hint={tr.recipientHint} error={errors.recipientName}>
          <Input id="gc-recipient" value={recipientName} maxLength={80} onChange={(e) => setRecipientName(e.target.value)} />
        </Field>
        <Field label={tr.message} htmlFor="gc-message" error={errors.message}>
          <Textarea id="gc-message" rows={3} maxLength={300} value={message} placeholder={tr.messagePlaceholder} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr.redeemWithin} htmlFor="gc-days" error={errors.redeemWithinDays}>
            <Input id="gc-days" type="number" min={7} max={730} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label={tr.reference} htmlFor="gc-ref">
            <Input id="gc-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function GiftDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const tr = useT(giftMessages);
  const canManage = useCan('payments.manage');
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'cancel' | 'redeem' | null>(null);
  const [reason, setReason] = useState('');
  const { data: g } = useQuery({
    queryKey: ['admin', 'gift-certificates', 'one', id],
    queryFn: () => call(api.GET('/api/admin/gift-certificates/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'gift-certificates'] }), qc.invalidateQueries({ queryKey: ['admin', 'memberships'] })]);
  const cancel = useMutation({
    mutationFn: () => call(api.POST('/api/admin/gift-certificates/{id}/cancel', { params: { path: { id: id! } }, body: { reason } })),
    onSuccess: async () => {
      await refresh();
      toast.success(tr.cancelled);
      setDialog(null);
    },
    onError: toastError,
  });
  const redeem = useMutation({
    mutationFn: (clientId: string) => call(api.POST('/api/admin/gift-certificates/{id}/redeem', { params: { path: { id: id! } }, body: { clientId } })),
    onSuccess: async (r) => {
      await refresh();
      toast.success(tr.redeemed(r.planName));
      setDialog(null);
    },
    onError: toastError,
  });

  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={g?.code ?? tr.title} description={g ? tr.planDetails(g.planName, g.visits, g.validityDays) : undefined}>
      {!g ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <StatusBadge status={g.status} label={tr.status[g.status]} />
          <KeyValue
            items={[
              { label: tr.recipient, value: g.recipientName ?? tr.noRecipient },
              { label: tr.buyer, value: <Link href={`/admin/clients/${g.buyer.id}`} className="text-brand-700">{g.buyer.name}</Link> },
              { label: tr.price, value: <Link href={`/admin/payments?id=${g.paymentId}`} className="text-brand-700">{fmt.money(g.price)}</Link> },
              { label: tr.sold, value: `${fmt.dateTime(g.createdAt)}${g.createdBy ? ` · ${g.createdBy.name}` : ''}` },
              { label: tr.redeemBy, value: fmt.date(g.expiresAt) },
              ...(g.redeemedBy ? [{ label: tr.redeemedBy, value: <Link href={`/admin/clients/${g.redeemedBy.id}?tab=memberships`} className="text-brand-700">{g.redeemedBy.name}</Link> }] : []),
              ...(g.redeemedAt ? [{ label: tr.redeemedOn, value: fmt.dateTime(g.redeemedAt) }] : []),
              ...(g.cancelledAt ? [{ label: tr.cancelledOn, value: `${fmt.dateTime(g.cancelledAt)}${g.cancelReason ? ` · ${g.cancelReason}` : ''}` }] : []),
            ]}
          />
          {g.message && <p className="rounded-2xl bg-canvas p-3 text-sm">“{g.message}”</p>}
          <div className="flex flex-wrap gap-2">
            {g.status === 'ACTIVE' && (
              <Link href={`/print/gift-certificate/${g.id}`} className={buttonClasses('outline', 'md')}>
                <Printer className="h-4 w-4" /> {tr.print}
              </Link>
            )}
            {canManage && g.status === 'ACTIVE' && <Button onClick={() => setDialog('redeem')}>{tr.redeemForClient}</Button>}
            {canManage && (g.status === 'ACTIVE' || g.status === 'EXPIRED') && (
              <Button variant="ghost" className="text-danger-700" onClick={() => setDialog('cancel')}>
                {tr.cancelCertificate}
              </Button>
            )}
          </div>
          <Modal open={dialog === 'redeem'} onOpenChange={(o) => !o && setDialog(null)} title={tr.redeemTitle} size="sm">
            <ClientPicker value={null} autoFocus onChange={(c) => c && redeem.mutate(c.id)} />
          </Modal>
          <Modal
            open={dialog === 'cancel'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={tr.cancelTitle}
            description={tr.cancelText}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {tr.keep}
                </Button>
                <Button variant="danger" loading={cancel.isPending} disabled={!reason.trim()} onClick={() => cancel.mutate()}>
                  {tr.confirmCancel}
                </Button>
              </>
            }
          >
            <Field label={tr.cancelReason} htmlFor="gc-reason">
              <Input id="gc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </Modal>
        </div>
      )}
    </Drawer>
  );
}

export default function GiftCertificatesPage() {
  return (
    <Suspense>
      <GiftCertificates />
    </Suspense>
  );
}
