'use client';

import { ChevronRight, Receipt, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ClientTopBar } from '@/components/client/client-shell';
import { MembershipCard, NoMembershipCard } from '@/components/client/membership-card';
import { RequireAuth } from '@/components/client/require-auth';
import { buttonClasses } from '@/components/ui/button';
import { ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card, Section } from '@/components/ui/layout';
import { fmt } from '@/lib/format';
import { useClub, useMyMembership, useMyPayments } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { membershipMessages, paymentMethodText } from '@/lib/i18n/messages/membership';

export default function MembershipPage() {
  return (
    <RequireAuth>
      <Membership />
    </RequireAuth>
  );
}

function Membership() {
  const { data, isLoading, error, refetch } = useMyMembership();
  const { data: payments } = useMyPayments();
  const { data: club } = useClub();
  const t = useT(membershipMessages);
  const pending = payments?.filter((p) => p.status === 'PENDING') ?? [];
  const others = data ? data.active.filter((m) => m.id !== data.current?.id) : [];

  return (
    <div className="space-y-6">
      <ClientTopBar title={t.membership} />
      {isLoading ? (
        <Skeleton className="h-60 w-full rounded-[28px]" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data?.current ? (
        <MembershipCard membership={data.current} action="details" />
      ) : (
        <NoMembershipCard trialAvailable={club?.policies.trial.enabled} trialPrice={club?.policies.trial.price} />
      )}

      {pending.length > 0 && (
        <Section title={t.awaitingPayment}>
          <div className="space-y-2">
            {pending.map((p) => (
              <Link key={p.id} href={`/payments/${p.id}`} className="flex items-center gap-3 rounded-2xl bg-warning-50 p-4 text-sm ring-1 ring-warning-600/15">
                <Receipt className="h-5 w-5 text-warning-700" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{p.plan?.name ?? p.description}</p>
                  <p className="text-warning-700">
                    {fmt.money(p.amount)} · {paymentMethodText(t.methods, p.method).name}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-warning-700" />
              </Link>
            ))}
          </div>
        </Section>
      )}

      {others.length > 0 && (
        <Section title={t.alsoActive}>
          <div className="space-y-2">
            {others.map((m) => (
              <MembershipRow key={m.id} id={m.id} name={m.planName} status={m.status} detail={t.activeDetail(m.visitsRemaining, m.visitsCredited, fmt.dayMonth(m.expiresAt))} />
            ))}
          </div>
        </Section>
      )}

      <Link href="/membership/buy" className={buttonClasses(data?.current ? 'secondary' : 'primary', 'lg', 'w-full')}>
        <Sparkles className="h-5 w-5" /> {data?.current ? t.buyAnother : t.choose}
      </Link>

      {data && data.past.length > 0 && (
        <Section title={t.history}>
          <div className="space-y-2">
            {data.past.map((m) => (
              <MembershipRow
                key={m.id}
                id={m.id}
                name={m.planName}
                status={m.status}
                detail={t.pastDetail(m.visitsUsed, m.visitsCredited, fmt.dateShort(m.startsAt), fmt.dateShort(m.expiresAt))}
              />
            ))}
          </div>
        </Section>
      )}

      {payments && payments.some((p) => p.status !== 'PENDING') && (
        <Section title={t.payments}>
          <Card padded={false} className="divide-y divide-line/70">
            {payments
              .filter((p) => p.status !== 'PENDING')
              .slice(0, 10)
              .map((p) => (
                <Link key={p.id} href={`/payments/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-brand-50/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.plan?.name ?? p.description ?? t.payment}</p>
                    <p className="text-muted">
                      {fmt.date(p.paidAt ?? p.createdAt)} · {paymentMethodText(t.methods, p.method).name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fmt.money(p.amount)}</p>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              ))}
          </Card>
        </Section>
      )}
    </div>
  );
}

function MembershipRow({ id, name, status, detail }: { id: string; name: string; status: string; detail: string }) {
  return (
    <Link href={`/membership/${id}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-line hover:ring-brand-200">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{name}</p>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-muted">{detail}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-subtle" />
    </Link>
  );
}
