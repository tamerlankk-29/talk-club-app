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

  return (
    <div className="space-y-4">
      <ClientTopBar title="My bookings" />
      <SegmentedControl
        className="w-full [&>button]:flex-1"
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
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
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Waitlist</h2>
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
                        Place reserved until {w.offerExpiresAt ? fmt.time(w.offerExpiresAt) : 'soon'}
                      </Badge>
                    ) : (
                      <Badge tone="info" className="mt-1">
                        #{w.position} in line
                      </Badge>
                    )}
                  </Link>
                  {w.status === 'OFFERED' ? (
                    <Link href={`/sessions/${w.session.id}`} className={buttonClasses('primary', 'sm')}>
                      Book
                    </Link>
                  ) : (
                    <Button variant="ghost" size="sm" loading={leave.isPending && leave.variables === w.session.id} onClick={() => leave.mutate(w.session.id)}>
                      Leave
                    </Button>
                  )}
                </Card>
              ))}
            </section>
          )}

          {data && data.items.length > 0 ? (
            <div className="space-y-3">
              {scope === 'upcoming' && data.waitlist.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Booked</h2>}
              {data.items.map((b) => (
                <BookingCard key={b.id} booking={b} showCancellation={scope === 'upcoming'} />
              ))}
            </div>
          ) : scope === 'upcoming' ? (
            data?.waitlist.length ? null : (
              <EmptyState
                icon={<CalendarPlus className="h-7 w-7" />}
                title="No upcoming sessions"
                description="Book a speaking session — groups are small, so seats go fast."
                action={
                  <Link href="/schedule" className={buttonClasses('primary')}>
                    Open schedule
                  </Link>
                }
              />
            )
          ) : (
            <EmptyState icon={<History className="h-7 w-7" />} title="No past sessions yet" description="Your attended sessions will appear here." />
          )}

          {scope === 'past' && (
            <Link href="/attendance" className="block text-center text-sm font-semibold text-brand-700">
              Attendance summary →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
