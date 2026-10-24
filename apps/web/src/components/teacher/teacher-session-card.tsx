import { ChevronRight, MapPin, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { Badge, StatusBadge } from '@/components/ui/feedback';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';

type TeacherSession = S<'TeacherSessionDto'>;

export function TeacherSessionCard({ s, showDate }: { s: TeacherSession; showDate?: boolean }) {
  const now = Date.now();
  const live = new Date(s.startsAt).getTime() <= now && new Date(s.endsAt).getTime() > now;
  return (
    <Link href={`/teacher/sessions/${s.id}`} className="block">
      <article className={cn('flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 transition hover:ring-brand-200', live ? 'ring-2 ring-brand-500' : 'ring-line/70')}>
        <div className={cn('flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl', live ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-900')}>
          <span className="font-display text-lg font-semibold leading-none">{s.startTime}</span>
          <span className={cn('mt-1 text-[11px]', live ? 'text-white/75' : 'text-muted')}>{s.endTime}</span>
        </div>
        <div className="min-w-0 flex-1">
          {showDate && <p className="text-xs font-semibold uppercase text-brand-700">{fmt.weekdayDate(s.startsAt)}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold">{s.title}</p>
            {live && <Badge tone="brand">Now</Badge>}
            {s.status === 'CANCELLED' && <StatusBadge status="CANCELLED" />}
          </div>
          <p className="truncate text-sm text-muted">
            {s.levelLabel} · {s.format === 'ONLINE' ? <Video className="inline h-3.5 w-3.5" /> : <MapPin className="inline h-3.5 w-3.5" />} {s.room?.name ?? (s.format === 'ONLINE' ? 'Online' : '—')}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Users className="h-4 w-4 text-brand-600" /> {s.booked}/{s.capacity}
            </span>
            {s.unmarked > 0 && new Date(s.startsAt).getTime() <= now && <span className="text-xs font-semibold text-warning-700">{s.unmarked} to mark</span>}
            {s.attendanceFinalized && <span className="text-xs text-muted">attendance closed</span>}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-subtle" />
      </article>
    </Link>
  );
}
