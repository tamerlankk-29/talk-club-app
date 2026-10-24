'use client';

import { CalendarPlus, History, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BookingCard } from '@/components/client/booking-card';
import { ClientTopBar } from '@/components/client/client-shell';
import { RequireAuth } from '@/components/client/require-auth';
import { useLeaveWaitlist } from '@/components/client/session-actions';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Card, SegmentedControl } from '@/components/ui/layout';
import { fmt } from '@/lib/format';
import { useMyBookings } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { sessionMessages } from '@/lib/i18n/messages/sessions';

export default function BookingsPage() {
  return (
    <RequireAuth>
      <Bookings />
    </RequireAuth>
  );
}

function Bookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error, refetch } = useMyBookings(scope);
  const leave = useLeaveWaitlist();
  const t = useT(sessionMessages);

  return (
    <div className="space-y-4">
      <ClientTopBar title={t.myBookings} />
      <SegmentedControl
        className="w-full [&>button]:flex-1"
        options={[
          { value: 'upcoming', label: t.upcoming },
          { value: 'past', label: t.past },
        ]}
        value={scope}
        onChange={setScope}
      />

      {isLoading ? (
        <SkeletonList count={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {scope === 'upcoming' && data && data.waitlist.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t.waitlist}</h2>
              {data.waitlist.map((w) => (
                <Card key={w.id} className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                    <Hourglass className="h-5 w-5" />
                  </span>
                  <Link href={`/sessions/${w.session.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {w.session.title}
                      {w.session.teacher ? ` · ${w.session.teacher.name}` : ''}
                    </p>
                    <p className="text-sm text-muted">{fmt.sessionWhen(w.session.startsAt)}</p>
                    {w.status === 'OFFERED' ? (
                      <Badge tone="zest" className="mt-1">
                        {t.placeReservedUntil(w.offerExpiresAt ? fmt.time(w.offerExpiresAt) : t.soon)}
                      </Badge>
                    ) : (
                      <Badge tone="info" className="mt-1">
                        {t.inLine(w.position)}
                      </Badge>
                    )}
                  </Link>
                  {w.status === 'OFFERED' ? (
                    <Link href={`/sessions/${w.session.id}`} className={buttonClasses('primary', 'sm')}>
                      {t.book}
                    </Link>
                  ) : (
                    <Button variant="ghost" size="sm" loading={leave.isPending && leave.variables === w.session.id} onClick={() => leave.mutate(w.session.id)}>
                      {t.leave}
                    </Button>
                  )}
                </Card>
              ))}
            </section>
          )}

          {data && data.items.length > 0 ? (
            <div className="space-y-3">
              {scope === 'upcoming' && data.waitlist.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t.bookedHeading}</h2>}
              {data.items.map((b) => (
                <BookingCard key={b.id} booking={b} showCancellation={scope === 'upcoming'} />
              ))}
            </div>
          ) : scope === 'upcoming' ? (
            data?.waitlist.length ? null : (
              <EmptyState
                icon={<CalendarPlus className="h-7 w-7" />}
                title={t.noUpcoming}
                description={t.noUpcomingText}
                action={
                  <Link href="/schedule" className={buttonClasses('primary')}>
                    {t.openSchedule}
                  </Link>
                }
              />
            )
          ) : (
            <EmptyState icon={<History className="h-7 w-7" />} title={t.noPast} description={t.noPastText} />
          )}

          {scope === 'past' && (
            <Link href="/attendance" className="block text-center text-sm font-semibold text-brand-700">
              {t.attendanceSummary}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
