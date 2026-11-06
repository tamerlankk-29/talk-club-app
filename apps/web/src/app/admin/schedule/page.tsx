'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { DateTime } from 'luxon';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { SessionFormDrawer, type SessionDraft } from '@/components/admin/session-form';
import { Button, buttonClasses } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { SegmentedControl } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminRooms, useAdminTeachers, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { clubNow, CLUB_TZ, formatDate } from '@/lib/format';
import { intlLocale } from '@/lib/i18n';
import { useClub } from '@/lib/queries';
import { cn, WEEKDAYS_SHORT } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { scheduleMessages } from '@/lib/i18n/messages/admin/schedule';

type Session = S<'SessionAdminDto'>;
type View = 'week' | 'day' | 'month';

const PX_PER_MIN = 1.15;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Side-by-side lanes for overlapping sessions within one column. */
function layout(sessions: Session[]): Array<{ s: Session; lane: number; lanes: number }> {
  const sorted = [...sessions].sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
  const out: Array<{ s: Session; lane: number; lanes: number }> = [];
  let cluster: Array<{ s: Session; lane: number; lanes: number }> = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = [];
    laneEnds.length = 0;
  };
  for (const s of sorted) {
    const start = minutesOf(s.startTime);
    const end = start + s.durationMinutes;
    if (cluster.length && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    cluster.push({ s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

function SessionBlock({ s, top, height, left, width }: { s: Session; top: number; height: number; left: string; width: string }) {
  const tr = useT(scheduleMessages);
  const color = s.groupType?.color ?? '#6d28d9';
  const cancelled = s.status === 'CANCELLED';
  const full = s.available === 0 && !cancelled;
  return (
    <Link
      href={`/admin/sessions/${s.id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn('absolute overflow-hidden rounded-xl border-l-4 px-2 py-1.5 text-xs shadow-sm transition hover:z-10 hover:shadow-md', cancelled && 'opacity-50')}
      style={{ top, height, left, width, borderColor: color, background: `${color}14` }}
      title={`${s.startTime}–${s.endTime} ${s.title} · ${s.teacher?.name ?? tr.noTeacherLower} · ${s.booked}/${s.capacity}`}
    >
      <p className={cn('truncate font-semibold text-ink', cancelled && 'line-through')}>
        {s.startTime} {s.title}
      </p>
      {height > 40 && <p className="truncate text-muted">{s.teacher?.name ?? tr.noTeacher}</p>}
      {height > 58 && (
        <p className="truncate text-muted">
          {s.room?.name ?? (s.format === 'ONLINE' ? tr.online : tr.noRoom)} · {s.levelLabel}
        </p>
      )}
      {height > 76 && (
        <p className={cn('mt-0.5 font-semibold', full ? 'text-danger-700' : 'text-brand-800')}>
          {cancelled ? tr.cancelled : tr.seatsWaiting(s.booked, s.capacity, s.waitlistCount)}
        </p>
      )}
    </Link>
  );
}

function TimeGrid({
  columns,
  range,
  onSlot,
}: {
  columns: Array<{ key: string; label: React.ReactNode; sessions: Session[]; draft: (time: string) => SessionDraft; muted?: boolean }>;
  range: { from: number; to: number };
  onSlot?: (draft: SessionDraft) => void;
}) {
  const height = (range.to - range.from) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = Math.ceil(range.from / 60) * 60; m <= range.to; m += 60) hours.push(m);
  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-white shadow-card">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div className="sticky top-16 z-20 border-b border-line bg-white" />
        {columns.map((c) => (
          <div key={c.key} className={cn('sticky top-16 z-20 border-b border-l border-line bg-white px-2 py-2.5 text-center text-sm font-semibold', c.muted && 'text-subtle')}>
            {c.label}
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {hours.map((m) => (
            <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-subtle" style={{ top: (m - range.from) * PX_PER_MIN }}>
              {hhmm(m)}
            </span>
          ))}
        </div>
        {columns.map((c) => (
          <div
            key={c.key}
            className={cn('relative border-l border-line', c.muted && 'bg-canvas/70', onSlot && 'cursor-copy')}
            style={{ height }}
            onClick={(e) => {
              if (!onSlot) return;
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
              const minutes = Math.round((range.from + y / PX_PER_MIN) / 15) * 15;
              onSlot(c.draft(hhmm(Math.min(minutes, range.to - 30))));
            }}
          >
            {hours.map((m) => (
              <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-line/60" style={{ top: (m - range.from) * PX_PER_MIN }} />
            ))}
            {layout(c.sessions).map(({ s, lane, lanes }) => (
              <SessionBlock
                key={s.id}
                s={s}
                top={(minutesOf(s.startTime) - range.from) * PX_PER_MIN + 1}
                height={Math.max(24, s.durationMinutes * PX_PER_MIN - 3)}
                left={`calc(${(lane / lanes) * 100}% + 3px)`}
                width={`calc(${100 / lanes}% - 6px)`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Schedule() {
  const tr = useT(scheduleMessages);
  const router = useRouter();
  const url = useUrlState();
  const canManage = useCan('schedule.manage');
  const { data: club } = useClub();
  const { data: teachers } = useAdminTeachers();
  const { data: rooms } = useAdminRooms();
  const view = (url.get('view', 'week') as View) || 'week';
  const anchor = DateTime.fromISO(url.get('date') || clubNow().toISODate()!, { zone: CLUB_TZ }).setLocale(intlLocale());
  const teacherId = url.get('teacher') || undefined;
  const roomId = url.get('room') || undefined;
  const [draft, setDraft] = useState<SessionDraft | null>(url.get('new') === '1' ? {} : null);

  const period = useMemo(() => {
    if (view === 'day') return { from: anchor.startOf('day'), to: anchor.endOf('day') };
    if (view === 'month') {
      const start = anchor.startOf('month').startOf('week');
      return { from: start, to: start.plus({ weeks: 6 }).minus({ milliseconds: 1 }) };
    }
    return { from: anchor.startOf('week'), to: anchor.endOf('week') };
  }, [view, anchor.toISODate()]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useQuery({
    queryKey: ['admin', 'sessions', view, period.from.toISODate(), teacherId, roomId],
    queryFn: () =>
      call(
        api.GET('/api/admin/sessions', {
          params: { query: { from: period.from.toUTC().toISO()!, to: period.to.toUTC().toISO()!, teacherId, roomId, includeCancelled: true } },
        }),
      ),
    placeholderData: (prev) => prev,
  });
  const sessions = query.data ?? [];

  const hours = (club?.location?.workingHours ?? {}) as Record<string, { open: string; close: string } | null>;
  const range = useMemo(() => {
    const opens = Object.values(hours).filter(Boolean).map((h) => minutesOf(h!.open));
    const closes = Object.values(hours).filter(Boolean).map((h) => minutesOf(h!.close));
    let from = opens.length ? Math.min(...opens) : 12 * 60;
    let to = closes.length ? Math.max(...closes) : 20 * 60;
    for (const s of sessions) {
      from = Math.min(from, minutesOf(s.startTime));
      to = Math.max(to, minutesOf(s.startTime) + s.durationMinutes);
    }
    return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
  }, [sessions, hours]);

  const step = (dir: 1 | -1) => {
    const next = view === 'day' ? anchor.plus({ days: dir }) : view === 'month' ? anchor.plus({ months: dir }) : anchor.plus({ weeks: dir });
    url.set({ date: next.toISODate() });
  };
  const title =
    view === 'day' ? formatDate(anchor, 'cccc, d MMMM yyyy') : view === 'month' ? formatDate(anchor, 'LLLL yyyy') : `${formatDate(period.from, 'd MMM')} – ${formatDate(period.to, 'd MMM yyyy')}`;
  const today = clubNow().toISODate();
  const onSlot = canManage ? (d: SessionDraft) => setDraft(d) : undefined;

  const weekColumns = Array.from({ length: 7 }, (_, i) => {
    const day = period.from.plus({ days: i });
    const iso = day.toISODate()!;
    return {
      key: iso,
      muted: !hours[String(day.weekday)],
      label: (
        <button type="button" onClick={() => url.set({ view: 'day', date: iso })} className={cn('rounded-lg px-2 py-0.5 hover:bg-brand-50', iso === today && 'bg-brand-700 text-white hover:bg-brand-800')}>
          {formatDate(day, 'ccc d')}
        </button>
      ),
      sessions: sessions.filter((s) => s.localDate === iso),
      draft: (time: string) => ({ date: iso, startTime: time, teacherId }),
    };
  });

  const dayIso = anchor.toISODate()!;
  const daySessions = sessions.filter((s) => s.localDate === dayIso);
  const roomColumns = [
    ...(rooms ?? [])
      .filter((r) => r.isActive && (!roomId || r.id === roomId))
      .map((r) => ({
        key: r.id,
        label: r.name,
        sessions: daySessions.filter((s) => s.room?.id === r.id),
        draft: (time: string) => ({ date: dayIso, startTime: time, roomId: r.id, teacherId }),
      })),
    ...(!roomId
      ? [
          {
            key: 'none',
            label: tr.onlineNoRoom,
            muted: true,
            sessions: daySessions.filter((s) => !s.room),
            draft: (time: string) => ({ date: dayIso, startTime: time, teacherId }),
          },
        ]
      : []),
  ];

  return (
    <AdminPage
      title={tr.schedule}
      description={query.data ? tr.sessionsBookings(sessions.filter((s) => s.status !== 'CANCELLED').length, sessions.reduce((n, s) => n + (s.status === 'CANCELLED' ? 0 : s.booked), 0)) : undefined}
      actions={
        <>
          <Link href="/admin/schedule/templates" className={buttonClasses('outline', 'sm')}>
            <Repeat className="h-4 w-4" /> {tr.weeklyTemplates}
          </Link>
          {canManage && (
            <Button size="sm" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => setDraft({ date: view === 'day' ? dayIso : undefined, teacherId })}>
              {tr.newSession}
            </Button>
          )}
        </>
      }
    >
      <Toolbar>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => step(-1)} aria-label={tr.previous}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => url.set({ date: null })}>
            {tr.today}
          </Button>
          <Button variant="outline" size="sm" onClick={() => step(1)} aria-label={tr.next}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="min-w-48 font-display text-lg font-semibold">{title}</h2>
        <SegmentedControl
          options={[
            { value: 'day', label: tr.day },
            { value: 'week', label: tr.week },
            { value: 'month', label: tr.month },
          ]}
          value={view}
          onChange={(v) => url.set({ view: v === 'week' ? null : v })}
        />
        <FilterSelect label={tr.teacher} value={teacherId ?? ''} onChange={(v) => url.set({ teacher: v })}>
          <option value="">{tr.allTeachers}</option>
          {teachers?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={tr.room} value={roomId ?? ''} onChange={(v) => url.set({ room: v })}>
          <option value="">{tr.allRooms}</option>
          {rooms?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-[600px] w-full rounded-3xl" />
      ) : view === 'month' ? (
        <MonthGrid anchor={anchor} start={period.from} sessions={sessions} onDay={(iso) => url.set({ view: 'day', date: iso })} />
      ) : (
        <TimeGrid columns={view === 'day' ? roomColumns : weekColumns} range={range} onSlot={onSlot} />
      )}
      {canManage && <p className="text-xs text-muted">{tr.tipClickEmptySlot}</p>}

      <SessionFormDrawer open={!!draft} onOpenChange={(o) => !o && setDraft(null)} draft={draft ?? undefined} onSaved={(s) => router.push(`/admin/sessions/${s.id}`)} />
    </AdminPage>
  );
}

function MonthGrid({ anchor, start, sessions, onDay }: { anchor: DateTime; start: DateTime; sessions: Session[]; onDay: (iso: string) => void }) {
  const tr = useT(scheduleMessages);
  const today = clubNow().toISODate();
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
      <div className="grid grid-cols-7 border-b border-line bg-canvas/60 text-center text-xs font-semibold uppercase tracking-wide text-muted">
        {WEEKDAYS_SHORT.slice(1).map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => {
          const day = start.plus({ days: i });
          const iso = day.toISODate()!;
          const list = sessions.filter((s) => s.localDate === iso && s.status !== 'CANCELLED');
          const booked = list.reduce((n, s) => n + s.booked, 0);
          const capacity = list.reduce((n, s) => n + s.capacity, 0);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDay(iso)}
              className={cn('min-h-28 border-b border-r border-line/70 p-2 text-left align-top transition hover:bg-brand-50/50', day.month !== anchor.month && 'bg-canvas/50 text-subtle')}
            >
              <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', iso === today && 'bg-brand-700 text-white')}>{day.day}</span>
              {list.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {list.slice(0, 3).map((s) => (
                    <p key={s.id} className="truncate text-[11px]">
                      <span className="font-semibold">{s.startTime}</span> {s.title}
                    </p>
                  ))}
                  {list.length > 3 && <p className="text-[11px] font-semibold text-brand-700">{tr.moreCount(list.length - 3)}</p>}
                  <p className="pt-0.5 text-[11px] text-muted">
                    {tr.bookedOfShort(booked, capacity)}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense>
      <Schedule />
    </Suspense>
  );
}
