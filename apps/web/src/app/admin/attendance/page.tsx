'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateTime } from 'luxon';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card } from '@/components/ui/layout';
import { toast, toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useUrlState } from '@/lib/admin-queries';
import { clubNow, CLUB_TZ, fmt } from '@/lib/format';
import { cn } from '@/lib/utils';

type Detail = S<'AdminSessionDetailDto'>;
type AttendanceStatus = S<'AttendanceStatus'>;

const OPTIONS: Array<{ value: AttendanceStatus; label: string; active: string }> = [
  { value: 'PRESENT', label: 'Present', active: 'bg-success-600 text-white border-success-600' },
  { value: 'LATE', label: 'Late', active: 'bg-warning-600 text-white border-warning-600' },
  { value: 'ABSENT', label: 'No-show', active: 'bg-danger-600 text-white border-danger-600' },
];

function Board() {
  const url = useUrlState();
  const day = DateTime.fromISO(url.get('date') || clubNow().toISODate()!, { zone: CLUB_TZ }).setLocale('en-GB');
  const iso = day.toISODate()!;
  const list = useQuery({
    queryKey: ['admin', 'sessions', 'attendance', iso],
    queryFn: () => call(api.GET('/api/admin/sessions', { params: { query: { date: iso } } })),
  });
  const sessions = (list.data ?? []).filter((s) => s.status !== 'CANCELLED');
  const details = useQueries({
    queries: sessions.map((s) => ({ queryKey: adminKeys.session(s.id), queryFn: () => call(api.GET('/api/admin/sessions/{id}', { params: { path: { id: s.id } } })) })),
  });

  return (
    <AdminPage
      title="Attendance"
      description="Mark who came. Unmarked participants are treated as no-shows when attendance is finalised."
      actions={
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => url.set({ date: day.minus({ days: 1 }).toISODate() })} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => url.set({ date: null })}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => url.set({ date: day.plus({ days: 1 }).toISODate() })} aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <h2 className="font-display text-lg font-semibold">{day.toFormat('cccc, d MMMM')}</h2>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Skeleton className="h-64 w-full rounded-3xl" />
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions this day" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sessions.map((s, i) => (
            <SessionAttendance key={s.id} detail={details[i]?.data} title={`${s.startTime} · ${s.title}`} sub={`${s.teacher?.name ?? 'No teacher'} · ${s.room?.name ?? 'Online'}`} sessionId={s.id} startsAt={s.startsAt} />
          ))}
        </div>
      )}
    </AdminPage>
  );
}

function SessionAttendance({ detail, title, sub, sessionId, startsAt }: { detail?: Detail; title: string; sub: string; sessionId: string; startsAt: string }) {
  const qc = useQueryClient();
  const started = new Date(startsAt).getTime() <= Date.now();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: adminKeys.session(sessionId) }), qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })]);
  const mark = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: AttendanceStatus }) => call(api.POST('/api/admin/bookings/{id}/attendance', { params: { path: { id: bookingId } }, body: { status } })),
    onSuccess: () => refresh(),
    onError: toastError,
  });
  const participants = (detail?.participants ?? []).filter((p) => p.status !== 'CANCELLED' && p.status !== 'LATE_CANCELLED');
  const unmarked = participants.filter((p) => !p.attendance);
  const all = useMutation({
    mutationFn: () => call(api.POST('/api/admin/sessions/{id}/attendance', { params: { path: { id: sessionId } }, body: { items: unmarked.map((p) => ({ bookingId: p.bookingId, status: 'PRESENT' as const })) } })),
    onSuccess: async (r) => {
      await refresh();
      toast.success(`Marked ${r.length} present.`);
    },
    onError: toastError,
  });
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <Link href={`/admin/sessions/${sessionId}`} className="font-semibold hover:text-brand-700">
            {title}
          </Link>
          <p className="truncate text-xs text-muted">{sub}</p>
        </div>
        {started && unmarked.length > 0 ? (
          <Button size="xs" variant="secondary" leftIcon={<CheckCheck className="h-3.5 w-3.5" />} loading={all.isPending} onClick={() => all.mutate()}>
            All {unmarked.length} present
          </Button>
        ) : started && participants.length > 0 ? (
          <Badge tone="success">Done</Badge>
        ) : (
          <Badge>Not started</Badge>
        )}
      </div>
      {!detail ? (
        <Skeleton className="m-5 h-16" />
      ) : participants.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">No participants.</p>
      ) : (
        <div className="divide-y divide-line/70">
          {participants.map((p) => (
            <div key={p.bookingId} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
              <Link href={`/admin/clients/${p.client.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand-700">
                {p.client.name}
                {p.kind === 'TRIAL' && <span className="ml-1.5 text-xs font-semibold text-zest-dark">trial</span>}
                {p.isFirstVisit && <span className="ml-1.5 text-xs font-semibold text-brand-700">first visit</span>}
              </Link>
              {started ? (
                <div className="flex gap-1">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      disabled={mark.isPending}
                      onClick={() => mark.mutate({ bookingId: p.bookingId, status: o.value })}
                      aria-pressed={p.attendance?.status === o.value}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
                        p.attendance?.status === o.value ? o.active : 'border-line bg-white hover:border-brand-300',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : (
                <StatusBadge status={p.status} />
              )}
              {p.attendance && <span className="w-full text-right text-[11px] text-subtle sm:w-auto">{p.attendance.method.toLowerCase()} · {fmt.time(p.attendance.markedAt)}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AttendancePage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}
