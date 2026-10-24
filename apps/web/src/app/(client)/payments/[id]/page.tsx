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
      toast.success('Payment request cancelled.');
    },
    onError: toastError,
  });

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-10" />;
  const p = query.data;
  if (!p) return <Skeleton className="mt-16 h-72 w-full rounded-3xl" />;

  const checkoutPath = p.checkoutUrl ? new URL(p.checkoutUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin) : null;

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/membership" title="Payment" />
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
          {p.instructions && (
            <InlineAlert tone="info" title={p.productType === 'TRIAL' ? 'How to pay for your trial' : 'How to pay'}>
              {p.instructions}
            </InlineAlert>
          )}
          {checkoutPath && (
            <Button
              size="lg"
              block
              rightIcon={<ExternalLink className="h-4 w-4" />}
              onClick={() => (checkoutPath.origin === window.location.origin ? router.push(checkoutPath.pathname) : window.location.assign(checkoutPath.toString()))}
            >
              Continue to payment
            </Button>
          )}
          {!checkoutPath && (
            <p className="text-center text-sm text-muted">
              We&apos;ll activate your membership as soon as the payment is confirmed. Questions?{' '}
              {club?.club.whatsapp ? (
                <a href={`https://wa.me/${club.club.whatsapp.replace(/\D/g, '')}`} className="font-semibold text-brand-700" target="_blank" rel="noreferrer">
                  Message us on WhatsApp
                </a>
              ) : (
                <Link href="/contact" className="font-semibold text-brand-700">
                  Contact us
                </Link>
              )}
            </p>
          )}
        </>
      )}

      {p.status === 'PAID' && p.membershipId && (
        <Link href={`/membership/${p.membershipId}`} className={buttonClasses('primary', 'lg', 'w-full')}>
          View my membership
        </Link>
      )}
      {p.status === 'FAILED' && (
        <InlineAlert tone="danger" title="Payment failed">
          {p.failureReason ?? 'The payment did not go through.'}{' '}
          <Link href="/membership/buy" className="font-semibold underline">
            Try again
          </Link>
        </InlineAlert>
      )}

      <Card>
        <KeyValue
          items={[
            { label: 'Method', value: p.method.name },
            { label: 'Created', value: fmt.dateTime(p.createdAt) },
            ...(p.paidAt ? [{ label: 'Paid', value: fmt.dateTime(p.paidAt) }] : []),
            ...(p.reference ? [{ label: 'Reference', value: p.reference }] : []),
            ...(p.refundedAmount ? [{ label: 'Refunded', value: `${fmt.money(p.refundedAmount)}${p.refundedAt ? ` · ${fmt.date(p.refundedAt)}` : ''}` }] : []),
          ]}
        />
      </Card>

      {p.status === 'PENDING' && p.productType === 'MEMBERSHIP' && (
        <>
          <Button variant="ghost" block className="text-danger-700" onClick={() => setCancelOpen(true)}>
            Cancel payment request
          </Button>
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title="Cancel this payment request?"
            description="If you have already paid, don't cancel — the administrator will confirm your payment."
            confirmLabel="Cancel request"
            cancelLabel="Keep it"
            tone="danger"
            loading={cancel.isPending}
            onConfirm={() => cancel.mutate()}
          />
        </>
      )}
    </div>
  );
}
