'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleCheckBig, CircleX, Clock3, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { useRefreshClientData } from '@/components/client/session-actions';
import { Button, buttonClasses } from '@/components/ui/button';
import { ErrorState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card, KeyValue, PageHeader } from '@/components/ui/layout';
import { ConfirmDialog } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { keys, useClub } from '@/lib/queries';
import { messagesFor, useT } from '@/lib/i18n';
import { membershipMessages, paymentMethodText } from '@/lib/i18n/messages/membership';

export default function PaymentPage() {
  return (
    <RequireAuth>
      <PaymentView />
    </RequireAuth>
  );
}

function PaymentView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const refresh = useRefreshClientData();
  const { data: club } = useClub();
  const [cancelOpen, setCancelOpen] = useState(false);
  const t = useT(membershipMessages);
  const query = useQuery({
    queryKey: keys.payment(id),
    queryFn: () => call(api.GET('/api/my/payments/{id}', { params: { path: { id } } })),
    // Keep checking while the administrator / provider confirms the payment.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 8000 : false),
  });
  const cancel = useMutation({
    mutationFn: () => call(api.POST('/api/my/payments/{id}/cancel', { params: { path: { id } } })),
    onSuccess: async () => {
      setCancelOpen(false);
      await Promise.all([refresh(), query.refetch()]);
      toast.success(messagesFor(membershipMessages).paymentCancelled);
    },
    onError: toastError,
  });

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-10" />;
  const p = query.data;
  if (!p) return <Skeleton className="mt-16 h-72 w-full rounded-3xl" />;

  const method = paymentMethodText(t.methods, { ...p.method, instructions: p.instructions });
  const checkoutPath = p.checkoutUrl ? new URL(p.checkoutUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin) : null;

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/membership" title={t.payment} />
      <Card className="text-center">
        {p.status === 'PAID' ? (
          <CircleCheckBig className="mx-auto h-14 w-14 animate-pop text-success-600" />
        ) : p.status === 'PENDING' ? (
          <Clock3 className="mx-auto h-14 w-14 text-warning-600" />
        ) : (
          <CircleX className="mx-auto h-14 w-14 text-muted" />
        )}
        <p className="mt-3 font-display text-3xl font-semibold">{fmt.money(p.amount)}</p>
        <p className="mt-1 text-muted">{p.plan?.name ?? p.description}</p>
        <StatusBadge status={p.status} className="mt-3" />
      </Card>

      {p.status === 'PENDING' && (
        <>
          {method.text && (
            <InlineAlert tone="info" title={p.productType === 'TRIAL' ? t.howToPayTrial : t.howToPay}>
              {method.text}
            </InlineAlert>
          )}
          {checkoutPath && (
            <Button
              size="lg"
              block
              rightIcon={<ExternalLink className="h-4 w-4" />}
              onClick={() => (checkoutPath.origin === window.location.origin ? router.push(checkoutPath.pathname) : window.location.assign(checkoutPath.toString()))}
            >
              {t.continueToPayment}
            </Button>
          )}
          {!checkoutPath && (
            <p className="text-center text-sm text-muted">
              {t.activateSoon}{' '}
              {club?.club.whatsapp ? (
                <a href={`https://wa.me/${club.club.whatsapp.replace(/\D/g, '')}`} className="font-semibold text-brand-700" target="_blank" rel="noreferrer">
                  {t.whatsapp}
                </a>
              ) : (
                <Link href="/contact" className="font-semibold text-brand-700">
                  {t.contactUs}
                </Link>
              )}
            </p>
          )}
        </>
      )}

      {p.status === 'PAID' && p.membershipId && (
        <Link href={`/membership/${p.membershipId}`} className={buttonClasses('primary', 'lg', 'w-full')}>
          {t.viewMyMembership}
        </Link>
      )}
      {p.status === 'FAILED' && (
        <InlineAlert tone="danger" title={t.paymentFailed}>
          {p.failureReason ?? t.didNotGoThrough}{' '}
          <Link href="/membership/buy" className="font-semibold underline">
            {t.tryAgain}
          </Link>
        </InlineAlert>
      )}

      <Card>
        <KeyValue
          items={[
            { label: t.method, value: method.name },
            { label: t.created, value: fmt.dateTime(p.createdAt) },
            ...(p.paidAt ? [{ label: t.paid, value: fmt.dateTime(p.paidAt) }] : []),
            ...(p.reference ? [{ label: t.reference, value: p.reference }] : []),
            ...(p.refundedAmount ? [{ label: t.refunded, value: `${fmt.money(p.refundedAmount)}${p.refundedAt ? ` · ${fmt.date(p.refundedAt)}` : ''}` }] : []),
          ]}
        />
      </Card>

      {p.status === 'PENDING' && p.productType === 'MEMBERSHIP' && (
        <>
          <Button variant="ghost" block className="text-danger-700" onClick={() => setCancelOpen(true)}>
            {t.cancelRequest}
          </Button>
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title={t.cancelRequestTitle}
            description={t.cancelRequestText}
            confirmLabel={t.cancelRequestConfirm}
            cancelLabel={t.keepIt}
            tone="danger"
            loading={cancel.isPending}
            onConfirm={() => cancel.mutate()}
          />
        </>
      )}
    </div>
  );
}
