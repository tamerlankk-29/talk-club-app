'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, CreditCard, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { StickyActions } from '@/components/client/sticky-actions';
import { Button } from '@/components/ui/button';
import { ErrorState, InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { Checkbox } from '@/components/ui/inputs';
import { PageHeader, Section } from '@/components/ui/layout';
import { toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { keys, usePlans } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function BuyMembershipPage() {
  return (
    <RequireAuth>
      <Buy />
    </RequireAuth>
  );
}

function Buy() {
  const router = useRouter();
  const plans = usePlans();
  const methods = useQuery({ queryKey: keys.methods, queryFn: () => call(api.GET('/api/public/payment-methods')) });
  const [planId, setPlanId] = useState<string | null>(null);
  const [methodCode, setMethodCode] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);

  const visible = (plans.data ?? []).filter((p) => p.isActive && p.isPublic).sort((a, b) => a.sortOrder - b.sortOrder);
  useEffect(() => {
    if (!planId && visible.length) setPlanId((visible.find((p) => p.isFeatured) ?? visible[0]).id);
  }, [visible, planId]);
  useEffect(() => {
    if (!methodCode && methods.data?.length) setMethodCode(methods.data[0].code);
  }, [methods.data, methodCode]);

  const plan = visible.find((p) => p.id === planId);
  const purchase = useMutation({
    mutationFn: () => call(api.POST('/api/payments', { body: { planId: planId!, methodCode: methodCode!, acceptOffer: accept } })),
    onSuccess: (payment) => {
      if (payment.checkoutUrl) {
        const url = new URL(payment.checkoutUrl, window.location.origin);
        if (url.origin === window.location.origin) router.push(url.pathname + url.search);
        else window.location.assign(url.toString());
      } else {
        router.push(`/payments/${payment.id}`);
      }
    },
    onError: toastError,
  });

  if (plans.error) return <ErrorState error={plans.error} onRetry={() => plans.refetch()} className="mt-10" />;

  return (
    <div className="space-y-6 pt-5">
      <PageHeader back="/membership" title="Choose a membership" subtitle="Each visit is one 90-minute speaking session." />

      {plans.isLoading ? (
        <SkeletonList count={4} />
      ) : (
        <div className="space-y-3" role="radiogroup" aria-label="Membership plans">
          {visible.map((p) => {
            const active = p.id === planId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPlanId(p.id)}
                className={cn(
                  'relative w-full rounded-3xl border-2 bg-white p-5 text-left shadow-card transition',
                  active ? 'border-brand-600 ring-4 ring-brand-100' : 'border-transparent ring-1 ring-line hover:ring-brand-200',
                )}
              >
                {p.isFeatured && (
                  <span className="absolute -top-2.5 right-5 inline-flex items-center gap-1 rounded-full bg-zest px-2.5 py-0.5 text-[11px] font-bold text-brand-950">
                    <Star className="h-3 w-3" /> Most popular
                  </span>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold tracking-wide">{p.name}</p>
                    <p className="text-sm text-muted">
                      {p.visits} visits · {p.validityDays} days
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-semibold">{fmt.money(p.price)}</p>
                    <p className="text-xs text-muted">{fmt.money(p.pricePerVisit)} / visit</p>
                  </div>
                </div>
                {p.description && <p className="mt-3 text-sm text-muted">{p.description}</p>}
                <span
                  className={cn(
                    'absolute bottom-5 right-5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
                    active ? 'border-brand-700 bg-brand-700 text-white' : 'border-line',
                  )}
                  aria-hidden="true"
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Section title="Payment method">
        {methods.data?.length ? (
          <div className="space-y-2" role="radiogroup" aria-label="Payment method">
            {methods.data.map((m) => (
              <button
                key={m.code}
                type="button"
                role="radio"
                aria-checked={methodCode === m.code}
                onClick={() => setMethodCode(m.code)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border-2 bg-white p-4 text-left transition',
                  methodCode === m.code ? 'border-brand-600' : 'border-transparent ring-1 ring-line',
                )}
              >
                <CreditCard className="mt-0.5 h-5 w-5 text-brand-700" />
                <div className="min-w-0">
                  <p className="font-semibold">{m.name}</p>
                  {m.instructions && <p className="mt-0.5 text-sm text-muted">{m.instructions}</p>}
                </div>
              </button>
            ))}
          </div>
        ) : methods.isLoading ? (
          <SkeletonList count={2} />
        ) : (
          <InlineAlert tone="info">Online payment is not available yet. Please pay at the club reception — the administrator will activate your membership.</InlineAlert>
        )}
      </Section>

      {plan && (
        <InlineAlert tone="brand">
          Your membership starts when the payment is confirmed and is valid for {plan.validityDays} days. Unused visits expire at the end of the period.
        </InlineAlert>
      )}

      <Checkbox
        checked={accept}
        onChange={setAccept}
        label={
          <>
            I accept the{' '}
            <Link href="/legal/PUBLIC_OFFER" target="_blank" className="font-semibold text-brand-700 underline">
              public offer
            </Link>{' '}
            and the club rules
          </>
        }
      />

      <StickyActions>
        <Button size="lg" block disabled={!plan || !methodCode || !accept} loading={purchase.isPending} onClick={() => purchase.mutate()}>
          {plan ? `Continue · ${fmt.money(plan.price)}` : 'Continue'}
        </Button>
      </StickyActions>
    </div>
  );
}
