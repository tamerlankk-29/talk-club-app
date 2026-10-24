'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Clock, Info, MapPin, ShieldCheck, TriangleAlert, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { SeatsIndicator, SessionAction } from '@/components/client/session-card';
import { StickyActions } from '@/components/client/sticky-actions';
import { useClaimOffer, useLeaveWaitlist } from '@/components/client/session-actions';
import { Button } from '@/components/ui/button';
import { Avatar, ErrorState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card, PageHeader } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { keys } from '@/lib/queries';
import { Rich, useT } from '@/lib/i18n';
import { sessionMessages } from '@/lib/i18n/messages/sessions';

const bold = { b: (c: ReactNode) => <span className="font-semibold text-ink">{c}</span> };

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { status, actingClientId, user } = useAuth();
  const query = useQuery({
    queryKey: [...keys.session(id), actingClientId ?? user?.client?.id ?? 'guest'],
    queryFn: () => call(api.GET('/api/sessions/{id}', { params: { path: { id } } })),
    enabled: status !== 'loading',
  });
  const leave = useLeaveWaitlist();
  const claim = useClaimOffer();
  const t = useT(sessionMessages);

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-10" />;
  const s = query.data;
  if (!s) {
    return (
      <div className="space-y-4 pt-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-3xl" />
      </div>
    );
  }
  const b = s.bookability;
  const offered = s.myWaitlist?.status === 'OFFERED';

  return (
    <div className="space-y-4 pt-5">
      <PageHeader back title={t.session} />

      <Card className="overflow-hidden" padded={false}>
        <div className="h-2" style={{ background: s.groupType?.color ?? 'var(--color-brand-600)' }} />
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-700">{s.levelLabel}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold leading-tight">{s.title}</h1>
              {s.topic && <p className="mt-1 text-sm text-muted">{t.topic(s.topic)}</p>}
            </div>
            <StatusBadge status={s.status} />
          </div>
          <div className="grid gap-3 text-sm">
            <Row icon={<CalendarClock className="h-4 w-4" />}>
              <span className="font-semibold">{fmt.localDate(s.localDate)}</span>
            </Row>
            <Row icon={<Clock className="h-4 w-4" />}>
              {s.startTime}–{s.endTime} · {t.durationMin(s.durationMinutes)}
            </Row>
            <Row icon={s.format === 'ONLINE' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}>
              {s.format === 'ONLINE' ? (
                s.onlineUrl ? (
                  <a href={s.onlineUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
                    {t.joinOnline}
                  </a>
                ) : (
                  t.onlineLinkAfterBooking
                )
              ) : (
                <span>
                  {s.room ? `${s.room.name} · ` : ''}
                  {s.location.address}
                  {s.location.addressDetails ? `, ${s.location.addressDetails}` : ''}{' '}
                  <Link href="/location" className="font-semibold text-brand-700">
                    {t.map}
                  </Link>
                </span>
              )}
            </Row>
            <Row icon={<Users className="h-4 w-4" />}>
              <SeatsIndicator session={s} />
            </Row>
            {s.waitlistCount > 0 && <p className="pl-7 text-xs text-muted">{t.onWaitlistCount(s.waitlistCount)}</p>}
          </div>
        </div>
      </Card>

      {s.teacher && (
        <Link href={`/teachers/${s.teacher.id}`} className="block">
          <Card className="flex items-center gap-4 transition hover:border-brand-200">
            <Avatar name={s.teacher.name} src={s.teacher.photoUrl} size="lg" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.teacher}</p>
              <p className="font-semibold">{s.teacher.name}</p>
              <p className="truncate text-sm text-muted">{[s.teacher.country, s.teacher.headline].filter(Boolean).join(' · ')}</p>
            </div>
          </Card>
        </Link>
      )}

      {s.description && (
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{s.description}</p>
        </Card>
      )}

      {offered && s.myWaitlist && (
        <InlineAlert tone="zest" title={t.reservedTitle}>
          {t.reservedText(s.myWaitlist.offerExpiresAt ? fmt.time(s.myWaitlist.offerExpiresAt) : t.offerExpires)}
        </InlineAlert>
      )}
      {s.myWaitlist && !offered && (
        <InlineAlert tone="info" title={t.waitlistTitle(s.myWaitlist.position)}>
          {t.waitlistText}
        </InlineAlert>
      )}

      {b && !s.myBooking && !s.myWaitlist && (
        <>
          {b.levelWarning && (
            <InlineAlert tone="warning" icon={<TriangleAlert className="h-5 w-5" />}>
              {b.levelWarning}
            </InlineAlert>
          )}
          {b.canBook && b.membershipName && (
            <InlineAlert tone="brand" icon={<Info className="h-5 w-5" />}>
              <Rich text={b.visitsRemainingAfter !== null ? t.usesVisitRemain(b.membershipName, b.visitsRemainingAfter) : t.usesVisit(b.membershipName)} tags={bold} />
            </InlineAlert>
          )}
          {b.canBookTrial && (
            <InlineAlert tone="zest" title={t.trialTitle(fmt.money(b.trialPrice))}>
              {t.trialText}
            </InlineAlert>
          )}
          {!b.canBook && !b.canBookTrial && b.message && (
            <InlineAlert tone={b.canJoinWaitlist ? 'info' : 'warning'}>
              {b.message}
              {(b.reason === 'BOOKING_NO_ACTIVE_MEMBERSHIP' || b.reason === 'BOOKING_NO_VISITS_LEFT') && (
                <>
                  {' '}
                  <Link href="/membership/buy" className="font-semibold underline">
                    {t.viewMemberships}
                  </Link>
                </>
              )}
            </InlineAlert>
          )}
        </>
      )}

      {s.status !== 'COMPLETED' && s.status !== 'CANCELLED' && (
        <div className="flex gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
          <ShieldCheck className="h-5 w-5 shrink-0 text-success-600" />
          <p className="text-muted">
            <Rich text={t.freeCancelUntil(`${fmt.weekdayDate(s.cancellationDeadline)}, ${fmt.time(s.cancellationDeadline)}`)} tags={bold} />
          </p>
        </div>
      )}

      <StickyActions>
        {offered && s.myWaitlist ? (
          <>
            <Button variant="ghost" size="lg" loading={leave.isPending} onClick={() => leave.mutate(s.id)}>
              {t.decline}
            </Button>
            <Button size="lg" block loading={claim.isPending} onClick={() => claim.mutate(s.myWaitlist!.id)}>
              {t.bookThePlace}
            </Button>
          </>
        ) : s.myWaitlist ? (
          <Button variant="outline" size="lg" block loading={leave.isPending} onClick={() => leave.mutate(s.id)}>
            {t.leaveWaitlist}
          </Button>
        ) : (
          <div className="flex-1 [&>button]:w-full">
            <SessionAction session={s} size="lg" block />
          </div>
        )}
      </StickyActions>
    </div>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-brand-600">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
