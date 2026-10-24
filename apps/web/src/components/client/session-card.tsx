'use client';

import { CircleCheck, Clock, MapPin, TriangleAlert, Video } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Badge, InlineAlert, StatusBadge } from '@/components/ui/feedback';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';
import type { ClientSession, Session } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { cn, plural } from '@/lib/utils';
import { useBookSession, useJoinWaitlist } from './session-actions';

export function SeatsIndicator({ session, compact }: { session: Session; compact?: boolean }) {
  const ratio = session.capacity ? session.booked / session.capacity : 0;
  const tone = session.available === 0 ? 'bg-danger-600' : session.available <= 2 ? 'bg-warning-600' : 'bg-success-600';
  return (
    <div className={cn('flex items-center gap-2', compact ? 'text-xs' : 'text-sm')}>
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: session.capacity }).map((_, i) => (
          <span key={i} className={cn('h-2 w-2 rounded-full', i < session.booked ? tone : 'bg-brand-100')} />
        ))}
      </div>
      <span className="font-medium text-muted">
        {session.booked} / {session.capacity} booked
        {session.available > 0 && session.status !== 'COMPLETED' ? ` · ${plural(session.available, 'seat')} left` : ''}
      </span>
      <span className="sr-only">{Math.round(ratio * 100)}% full</span>
    </div>
  );
}

/** The primary action for a session, derived from the server-side bookability. */
export function SessionAction({ session, size = 'sm', block }: { session: ClientSession; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  const router = useRouter();
  const { status } = useAuth();
  const book = useBookSession();
  const waitlist = useJoinWaitlist();
  const [pending, setPending] = useState<{ trial: boolean } | null>(null);
  const b = session.bookability;
  // One tap books — unless the client should know something first.
  const needsConfirm = !!b && (!b.freeCancellationAvailable || !!b.levelWarning);
  const start = (trial: boolean) => (needsConfirm ? setPending({ trial }) : book.mutate({ sessionId: session.id, trial }));
  const confirmDialog = b && (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(open) => !open && setPending(null)}
      title="Book this session?"
      description={`${session.title} · ${fmt.sessionWhen(session.startsAt)}`}
      confirmLabel={pending?.trial ? `Book trial · ${fmt.money(b.trialPrice)}` : 'Book anyway'}
      cancelLabel="Not now"
      loading={book.isPending}
      onConfirm={() => pending && book.mutate({ sessionId: session.id, trial: pending.trial }, { onSettled: () => setPending(null) })}
    >
      <div className="space-y-2">
        {b.levelWarning && (
          <InlineAlert tone="warning" icon={<TriangleAlert className="h-5 w-5" />}>
            {b.levelWarning}
          </InlineAlert>
        )}
        {!b.freeCancellationAvailable && (
          <InlineAlert tone="warning" icon={<TriangleAlert className="h-5 w-5" />} title="No free cancellation">
            The free-cancellation deadline for this session has passed. If you cancel or don&apos;t come, the visit will not be returned.
          </InlineAlert>
        )}
      </div>
    </ConfirmDialog>
  );

  if (session.myBooking?.status === 'BOOKED') {
    return (
      <Button size={size} variant="secondary" block={block} leftIcon={<CircleCheck className="h-4 w-4" />} onClick={() => router.push(`/bookings/${session.myBooking!.id}`)}>
        Booked
      </Button>
    );
  }
  if (session.myWaitlist) {
    return (
      <Button size={size} variant="outline" block={block} onClick={() => router.push(`/sessions/${session.id}`)}>
        {session.myWaitlist.status === 'OFFERED' ? 'Book the place' : `Waitlist #${session.myWaitlist.position}`}
      </Button>
    );
  }
  if (session.status === 'COMPLETED' || session.status === 'STARTED' || session.status === 'CANCELLED') return null;
  if (status !== 'authenticated') {
    return (
      <Button size={size} block={block} onClick={() => router.push(`/login?next=${encodeURIComponent(`/sessions/${session.id}`)}`)}>
        Book
      </Button>
    );
  }
  if (b?.canBook) {
    return (
      <>
        <Button size={size} block={block} loading={book.isPending && !pending} onClick={() => start(false)}>
          Book
        </Button>
        {confirmDialog}
      </>
    );
  }
  if (b?.canBookTrial) {
    return (
      <>
        <Button size={size} variant="accent" block={block} loading={book.isPending && !pending} onClick={() => start(true)}>
          Trial · {fmt.money(b.trialPrice)}
        </Button>
        {confirmDialog}
      </>
    );
  }
  if (b?.canJoinWaitlist) {
    return (
      <Button size={size} variant="outline" block={block} loading={waitlist.isPending} onClick={() => waitlist.mutate(session.id)}>
        Join waitlist
      </Button>
    );
  }
  if (b?.reason === 'BOOKING_NO_ACTIVE_MEMBERSHIP' || b?.reason === 'BOOKING_NO_VISITS_LEFT' || b?.reason === 'BOOKING_MEMBERSHIP_EXPIRES_BEFORE_SESSION') {
    return (
      <Button size={size} variant="secondary" block={block} onClick={() => router.push('/membership/buy')}>
        Get membership
      </Button>
    );
  }
  return (
    <Button size={size} variant="outline" block={block} onClick={() => router.push(`/sessions/${session.id}`)}>
      Details
    </Button>
  );
}

export function SessionCard({ session, showDate }: { session: ClientSession; showDate?: boolean }) {
  return (
    <article
      className={cn(
        'group relative rounded-3xl border border-line/70 bg-white p-4 shadow-card transition hover:border-brand-200',
        (session.status === 'COMPLETED' || session.status === 'CANCELLED') && 'opacity-60',
      )}
    >
      <Link href={`/sessions/${session.id}`} className="absolute inset-0 rounded-3xl" aria-label={`${session.title}, ${fmt.sessionWhen(session.startsAt)}`} />
      <div className="flex items-start gap-4">
        <div className="w-14 shrink-0 text-center">
          <p className="font-display text-lg font-semibold leading-none text-ink">{session.startTime}</p>
          <p className="mt-1 text-xs text-muted">{session.endTime}</p>
          {showDate && <p className="mt-2 text-[11px] font-semibold uppercase text-brand-700">{fmt.weekdayDate(session.startsAt)}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold text-ink">{session.title}</h3>
            {session.status !== 'OPEN' && session.status !== 'SCHEDULED' && <StatusBadge status={session.status} />}
            {session.myWaitlist?.status === 'OFFERED' && <Badge tone="zest">Place reserved for you</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-medium text-brand-800">{session.levelLabel}</span>
            <span className="inline-flex items-center gap-1">
              {session.format === 'ONLINE' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              {session.format === 'ONLINE' ? 'Online' : (session.room?.name ?? session.location.name)}
            </span>
          </div>
          {session.teacher && (
            <div className="mt-2.5 flex items-center gap-2">
              <Avatar name={session.teacher.name} src={session.teacher.photoUrl} size="xs" />
              <span className="text-sm font-medium text-ink">{session.teacher.name}</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <SeatsIndicator session={session} compact />
            <div className="relative z-10">
              <SessionAction session={session} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Small horizontal card for "today / tomorrow" strips on the home screen. */
export function SessionMiniCard({ session }: { session: ClientSession }) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="flex w-56 shrink-0 flex-col rounded-3xl border border-line/70 bg-white p-4 shadow-card transition hover:border-brand-200"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
          <Clock className="h-4 w-4 text-brand-600" /> {session.startTime}–{session.endTime}
        </span>
        {session.status === 'ALMOST_FULL' && <span className="text-xs font-semibold text-warning-700">{session.available} left</span>}
      </div>
      <p className="mt-2 truncate font-semibold">{session.title}</p>
      <p className="truncate text-sm text-muted">
        {session.levelLabel}
        {session.teacher ? ` · ${session.teacher.name}` : ''}
      </p>
    </Link>
  );
}
