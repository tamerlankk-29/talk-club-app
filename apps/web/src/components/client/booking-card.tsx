import { ChevronRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Badge, StatusBadge } from '@/components/ui/feedback';
import type { Booking } from '@/lib/api/types';
import { clubTime, fmt, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { sessionMessages } from '@/lib/i18n/messages/sessions';
import { cn } from '@/lib/utils';

/** Booking row for "My bookings" and the attendance history. */
export function BookingCard({ booking, showCancellation = true }: { booking: Booking; showCancellation?: boolean }) {
  const s = booking.session;
  const start = clubTime(s.startsAt);
  const upcoming = booking.status === 'BOOKED' && new Date(s.endsAt).getTime() > Date.now();
  const c = booking.cancellation;
  const t = useT(sessionMessages);
  return (
    <Link href={`/bookings/${booking.id}`} className="block">
      <article className="flex items-center gap-4 rounded-3xl border border-line/70 bg-white p-4 shadow-card transition hover:border-brand-200">
        <div className={cn('flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-2xl', upcoming ? 'bg-brand-700 text-white' : 'bg-canvas text-ink')}>
          <span className={cn('text-[11px] font-semibold uppercase', upcoming ? 'text-white/75' : 'text-muted')}>{formatDate(start, 'ccc')}</span>
          <span className="font-display text-xl font-semibold leading-none">{start.day}</span>
          <span className={cn('text-[11px] font-medium', upcoming ? 'text-white/75' : 'text-muted')}>{formatDate(start, 'MMM')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold">{s.teacher?.name ?? s.title}</p>
            {booking.kind === 'TRIAL' && <Badge tone="zest">{t.trialBadge}</Badge>}
          </div>
          <p className="truncate text-sm text-muted">
            {s.startTime}–{s.endTime} · {s.levelLabel}
            {s.room ? ` · ${s.room.name}` : s.format === 'ONLINE' ? ` · ${t.online}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {s.status === 'CANCELLED' && booking.status !== 'BOOKED' ? (
              <Badge tone="neutral" dot>
                {t.sessionCancelled}
              </Badge>
            ) : (
              <StatusBadge status={booking.status} />
            )}
            {showCancellation && upcoming && c?.canCancel && (
              <span className={cn('inline-flex items-center gap-1 text-xs font-medium', c.isLate ? 'text-warning-700' : 'text-success-700')}>
                {c.isLate ? <TriangleAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {c.isLate ? t.freeCancelEnded : t.freeCancelShort(`${fmt.weekdayDate(c.deadline).split(',')[0]} ${fmt.time(c.deadline)}`)}
              </span>
            )}
            {booking.status === 'CANCELLED' && booking.visitReturned && <span className="text-xs text-muted">{t.visitReturned}</span>}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-subtle" />
      </article>
    </Link>
  );
}
