'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CircleCheckBig, Clock, MapPin, MessageSquareQuote, Navigation, ShieldCheck, Ticket, TriangleAlert, Video, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { AddToCalendar } from '@/components/client/calendar-menu';
import { CancelBookingDialog } from '@/components/client/cancel-dialog';
import { RequireAuth } from '@/components/client/require-auth';
import { Button, buttonClasses } from '@/components/ui/button';
import { Avatar, Badge, ErrorState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card, KeyValue, PageHeader } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import type { Booking } from '@/lib/api/types';
import { dayLabel, fmt } from '@/lib/format';
import { keys, useMyMembership, useMyPayments } from '@/lib/queries';
import { messagesFor, Rich, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { sessionMessages } from '@/lib/i18n/messages/sessions';

const bold = { b: (c: ReactNode) => <span className="font-semibold text-ink">{c}</span> };

export default function BookingPage() {
  return (
    <RequireAuth>
      <Suspense>
        <BookingView />
      </Suspense>
    </RequireAuth>
  );
}

function BookingView() {
  const { id } = useParams<{ id: string }>();
  const confirmed = useSearchParams().get('confirmed') === '1';
  const query = useQuery({ queryKey: keys.booking(id), queryFn: () => call(api.GET('/api/bookings/{id}', { params: { path: { id } } })) });

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-10" />;
  if (!query.data) {
    return (
      <div className="space-y-4 pt-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full rounded-3xl" />
      </div>
    );
  }
  return confirmed && query.data.status === 'BOOKED' ? <Confirmation booking={query.data} /> : <Details booking={query.data} />;
}

function SessionSummary({ booking }: { booking: Booking }) {
  const s = booking.session;
  const t = useT(sessionMessages);
  return (
    <div className="space-y-3 text-sm">
      {s.teacher && (
        <div className="flex items-center gap-3">
          <Avatar name={s.teacher.name} src={s.teacher.photoUrl} />
          <div>
            <p className="font-semibold">{s.teacher.name}</p>
            <p className="text-muted">
              {s.title} · {s.levelLabel}
            </p>
          </div>
        </div>
      )}
      <Line icon={<CalendarClock className="h-4 w-4" />}>
        <span className="font-semibold">{fmt.localDate(s.localDate)}</span>
      </Line>
      <Line icon={<Clock className="h-4 w-4" />}>
        {s.startTime}–{s.endTime} · {t.durationMin(s.durationMinutes)}
      </Line>
      {s.format === 'ONLINE' ? (
        <Line icon={<Video className="h-4 w-4" />}>
          {booking.onlineUrl ? (
            <a href={booking.onlineUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
              {t.joinOnlineSession}
            </a>
          ) : (
            t.onlineLinkLater
          )}
        </Line>
      ) : (
        <Line icon={<MapPin className="h-4 w-4" />}>
          {s.room ? <span className="font-semibold">{s.room.name}</span> : null}
          {s.room ? ' · ' : ''}
          {s.location.address}
          {s.location.addressDetails ? `, ${s.location.addressDetails}` : ''}
        </Line>
      )}
    </div>
  );
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-brand-600">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function useMembershipFor(booking: Booking) {
  const { data } = useMyMembership();
  if (!booking.membershipId || !data) return null;
  return [...data.active, ...(data.current ? [data.current] : [])].find((m) => m.id === booking.membershipId) ?? null;
}

function TrialPaymentNotice() {
  const { data: payments } = useMyPayments();
  const pending = payments?.find((p) => p.productType === 'TRIAL' && p.status === 'PENDING');
  const t = useT(sessionMessages);
  if (!pending) return null;
  return (
    <InlineAlert
      tone="warning"
      icon={<Wallet className="h-5 w-5" />}
      title={t.trialPayment(fmt.money(pending.amount))}
      action={
        <Link href={`/payments/${pending.id}`} className="text-sm font-semibold underline">
          {t.howToPay}
        </Link>
      }
    >
      {t.trialPayText}
    </InlineAlert>
  );
}

/** "See you today at 16:45", "… tomorrow at 18:30", "… on Mon, 5 Oct at 18:30" */
function seeYouWhen(iso: string): string {
  const day = dayLabel(iso);
  const time = fmt.time(iso);
  const t = messagesFor(sessionMessages);
  const common = messagesFor(commonMessages);
  if (day === common.today) return t.seeYouToday(time);
  if (day === common.tomorrow) return t.seeYouTomorrow(time);
  return t.seeYouOn(day, time);
}

function Confirmation({ booking }: { booking: Booking }) {
  const membership = useMembershipFor(booking);
  const c = booking.cancellation;
  const t = useT(sessionMessages);
  return (
    <div className="space-y-5 pt-8">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-zest text-brand-950 shadow-float">
          <CircleCheckBig className="h-10 w-10" />
        </div>
        <h1 className="mt-5 font-display text-[28px] font-semibold">{t.youreBooked}</h1>
        <p className="mt-1 text-muted">{seeYouWhen(booking.session.startsAt)}</p>
      </div>

      <Card>
        <SessionSummary booking={booking} />
      </Card>

      {booking.kind === 'TRIAL' ? (
        <TrialPaymentNotice />
      ) : (
        membership && (
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
            <Ticket className="h-5 w-5 shrink-0" />
            <p>
              <span className="font-semibold">{membership.planName}</span>: {t.visitsLeftUntil(membership.visitsRemaining, fmt.dayMonth(membership.expiresAt))}
            </p>
          </div>
        )
      )}

      {c && (
        <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
          <ShieldCheck className="h-5 w-5 shrink-0 text-success-600" />
          <p className="text-muted">
            {c.isLate ? t.noFreeCancelAnymore : <Rich text={t.freeCancelUntilShort(`${fmt.weekdayDate(c.deadline)}, ${fmt.time(c.deadline)}`)} tags={bold} />}
          </p>
        </div>
      )}

      <div className="grid gap-2.5">
        <AddToCalendar booking={booking} block />
        {booking.session.format !== 'ONLINE' && (
          <Link href="/location" className={buttonClasses('outline', 'md', 'w-full')}>
            <Navigation className="h-4 w-4" /> {t.getDirections}
          </Link>
        )}
        <Link href="/bookings" className={buttonClasses('primary', 'lg', 'w-full')}>
          {t.goToBookings}
        </Link>
        <Link href="/schedule" className="py-2 text-center text-sm font-semibold text-brand-700">
          {t.bookAnother}
        </Link>
      </div>
    </div>
  );
}

function Details({ booking }: { booking: Booking }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const t = useT(sessionMessages);
  const membership = useMembershipFor(booking);
  const s = booking.session;
  const upcoming = booking.status === 'BOOKED' && new Date(s.endsAt).getTime() > Date.now();
  const c = booking.cancellation;

  return (
    <div className="space-y-4 pt-5">
      <PageHeader back="/bookings" title={t.booking} actions={<StatusBadge status={booking.status} />} />

      {s.status === 'CANCELLED' && (
        <InlineAlert tone="warning" icon={<TriangleAlert className="h-5 w-5" />} title={t.cancelledByClub}>
          {booking.visitReturned ? t.visitReturnedLong : null}
        </InlineAlert>
      )}

      <Card>
        <SessionSummary booking={booking} />
      </Card>

      {booking.kind === 'TRIAL' && upcoming && <TrialPaymentNotice />}

      <Card>
        <KeyValue
          items={[
            { label: t.bookedAt, value: fmt.dateTime(booking.bookedAt) },
            { label: t.type, value: booking.kind === 'TRIAL' ? <Badge tone="zest">{t.trialSession}</Badge> : (booking.membershipName ?? t.membership) },
            ...(booking.attendance ? [{ label: t.attendance, value: <StatusBadge status={booking.attendance.status} /> }] : []),
            ...(booking.cancelledAt ? [{ label: t.cancelledAt, value: fmt.dateTime(booking.cancelledAt) }] : []),
            ...(booking.membershipId
              ? [
                  {
                    label: t.visit,
                    value: booking.visitReturned ? t.returnedToMembership : booking.visitDeducted ? t.used : '—',
                  },
                ]
              : []),
            ...(membership && upcoming ? [{ label: t.visitsLeft, value: t.visitsLeftValue(membership.visitsRemaining, fmt.dayMonth(membership.expiresAt)) }] : []),
          ]}
        />
        {booking.cancelReason && <p className="mt-3 text-sm text-muted">{t.reason(booking.cancelReason)}</p>}
      </Card>

      {booking.hasFeedback && (
        <Link href="/profile/progress" className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-800">
          <MessageSquareQuote className="h-5 w-5" /> {t.feedbackLeft}
        </Link>
      )}

      {upcoming && (
        <>
          {c && c.canCancel && (
            <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
              {c.isLate ? <TriangleAlert className="h-5 w-5 shrink-0 text-warning-600" /> : <ShieldCheck className="h-5 w-5 shrink-0 text-success-600" />}
              <p className="text-muted">
                <Rich
                  text={(c.isLate ? t.lateCancelWarning : t.freeCancelReturn)(`${fmt.weekdayDate(c.deadline)}, ${fmt.time(c.deadline)}`)}
                  tags={bold}
                />
              </p>
            </div>
          )}
          <div className="grid gap-2.5">
            <AddToCalendar booking={booking} block />
            {c?.canCancel && (
              <Button variant="ghost" className="text-danger-700 hover:bg-danger-50" onClick={() => setCancelOpen(true)}>
                {t.cancelBooking}
              </Button>
            )}
          </div>
          <CancelBookingDialog bookingId={booking.id} open={cancelOpen} onOpenChange={setCancelOpen} />
        </>
      )}
    </div>
  );
}
