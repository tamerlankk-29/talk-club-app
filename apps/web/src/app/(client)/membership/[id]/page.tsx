'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CalendarPlus2, Gift, RotateCcw, Settings2, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { MembershipCard } from '@/components/client/membership-card';
import { RequireAuth } from '@/components/client/require-auth';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Card, KeyValue, PageHeader, Section } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { membershipMessages } from '@/lib/i18n/messages/membership';
import { cn } from '@/lib/utils';

type Tx = S<'MembershipTransactionDto'>;

const TX_ICON: Record<Tx['type'], ReactNode> = {
  PURCHASE: <ShoppingBag className="h-4 w-4" />,
  GRANT: <Gift className="h-4 w-4" />,
  BOOKING: <ArrowUpRight className="h-4 w-4" />,
  CANCELLATION_REFUND: <RotateCcw className="h-4 w-4" />,
  SESSION_CANCELLED_REFUND: <RotateCcw className="h-4 w-4" />,
  ADMIN_RETURN: <ArrowDownLeft className="h-4 w-4" />,
  ADMIN_ADJUSTMENT: <Settings2 className="h-4 w-4" />,
  EXTENSION: <CalendarPlus2 className="h-4 w-4" />,
};

export default function MembershipDetailPage() {
  return (
    <RequireAuth>
      <Detail />
    </RequireAuth>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const m = useT(membershipMessages);
  const { data, error, refetch } = useQuery({
    queryKey: keys.membershipDetail(id),
    queryFn: () => call(api.GET('/api/my/memberships/{id}', { params: { path: { id } } })),
  });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="mt-10" />;
  if (!data) return <Skeleton className="mt-16 h-60 w-full rounded-[28px]" />;

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/membership" title={data.planName} subtitle={m.visitHistory} />
      <MembershipCard membership={data} action="none" />
      <Card>
        <KeyValue
          items={[
            { label: m.started, value: fmt.date(data.startsAt) },
            { label: m.validUntil, value: fmt.date(data.expiresAt) },
            ...(data.originalExpiresAt !== data.expiresAt ? [{ label: m.originallyUntil, value: fmt.date(data.originalExpiresAt) }] : []),
            { label: m.visits, value: m.visitsValue(data.visitsUsed, data.visitsRemaining) },
            { label: m.price, value: fmt.money(data.price) },
          ]}
        />
      </Card>
      <Section title={m.ledger} description={m.ledgerHint}>
        <Card padded={false} className="divide-y divide-line/70">
          {data.transactions.map((t) => {
            const positive = t.delta > 0;
            return (
              <div key={t.id} className="flex items-start gap-3 px-5 py-4">
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', positive ? 'bg-success-50 text-success-700' : t.delta < 0 ? 'bg-brand-50 text-brand-700' : 'bg-canvas text-muted')}>
                  {TX_ICON[t.type]}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{m.tx[t.type]}</p>
                  {t.booking ? (
                    <Link href={`/bookings/${t.booking.id}`} className="text-brand-700">
                      {t.booking.session.title}
                      {t.booking.session.teacherName ? ` · ${t.booking.session.teacherName}` : ''} · {fmt.weekdayDate(t.booking.session.startsAt)} {fmt.time(t.booking.session.startsAt)}
                    </Link>
                  ) : t.reason ? (
                    <p className="text-muted">{t.reason}</p>
                  ) : null}
                  {t.type === 'EXTENSION' && t.expiresAtAfter && <p className="text-muted">{m.newEndDate(fmt.date(t.expiresAtAfter))}</p>}
                  <p className="mt-0.5 text-xs text-subtle">{fmt.dateTime(t.createdAt)}</p>
                </div>
                <div className="text-right">
                  {t.delta !== 0 && <p className={cn('font-display font-semibold', positive ? 'text-success-700' : 'text-ink')}>{positive ? `+${t.delta}` : t.delta}</p>}
                  <p className="text-xs text-muted">{m.balance(t.balanceAfter)}</p>
                </div>
              </div>
            );
          })}
        </Card>
      </Section>
    </div>
  );
}
