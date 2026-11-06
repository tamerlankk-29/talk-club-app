'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, MessageSquareQuote, QrCode, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FeedbackDialog } from '@/components/admin/feedback-dialog';
import { Button, buttonClasses } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorState, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader } from '@/components/ui/layout';
import { toast, toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { teacherMessages } from '@/lib/i18n/messages/teacher';

type Participant = S<'TeacherParticipantDto'>;
type AttendanceStatus = S<'AttendanceStatus'>;

const OPTIONS: Array<{ value: AttendanceStatus; label: 'here' | 'late' | 'absent'; active: string }> = [
  { value: 'PRESENT', label: 'here', active: 'bg-success-600 text-white border-success-600' },
  { value: 'LATE', label: 'late', active: 'bg-warning-600 text-white border-warning-600' },
  { value: 'ABSENT', label: 'absent', active: 'bg-danger-600 text-white border-danger-600' },
];

export default function TeacherSessionPage() {
  const t = useT(teacherMessages);
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ['teacher', 'session', id];
  const query = useQuery({ queryKey: key, queryFn: () => call(api.GET('/api/teacher/sessions/{id}', { params: { path: { id } } })), refetchInterval: 30_000 });
  const [feedbackFor, setFeedbackFor] = useState<Participant | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['teacher', 'sessions'] })]);

  const mark = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: AttendanceStatus }) => call(api.POST('/api/teacher/bookings/{id}/attendance', { params: { path: { id: bookingId } }, body: { status } })),
    onSuccess: () => refresh(),
    onError: toastError,
  });
  const allPresent = useMutation({
    mutationFn: () => call(api.POST('/api/teacher/sessions/{id}/attendance/all-present', { params: { path: { id } } })),
    onSuccess: async (r) => {
      await refresh();
      toast.success(t.markedPresent(r.length));
    },
    onError: toastError,
  });

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-8" />;
  const d = query.data;
  if (!d) return <Skeleton className="h-96 w-full rounded-3xl" />;
  const s = d.session;
  const active = d.participants.filter((p) => p.status !== 'CANCELLED' && p.status !== 'LATE_CANCELLED');
  const unmarked = active.filter((p) => !p.attendance).length;
  const started = new Date(s.startsAt).getTime() <= Date.now();

  return (
    <div className="space-y-5">
      <PageHeader back="/teacher" title={s.title} subtitle={`${fmt.weekdayDate(s.startsAt)} · ${s.startTime}–${s.endTime} · ${s.room?.name ?? (s.format === 'ONLINE' ? t.online : '')}`} />
      <Card className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone="brand">{s.levelLabel}</Badge>
        <span className="font-semibold">{t.participants(active.length, s.capacity)}</span>
        {s.topic && <span className="text-muted">· {s.topic}</span>}
        {d.onlineUrl && (
          <a href={d.onlineUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700">
            <Video className="h-4 w-4" /> {t.joinOnline}
          </a>
        )}
      </Card>
      {!d.canMarkAttendance && started && <InlineAlert tone="info">{t.windowClosed}</InlineAlert>}
      {!started && <InlineAlert tone="info">{t.notStarted}</InlineAlert>}
      {d.canMarkAttendance && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" leftIcon={<CheckCheck className="h-4 w-4" />} disabled={!unmarked} loading={allPresent.isPending} onClick={() => allPresent.mutate()}>
            {t.allPresent}{unmarked ? ` (${unmarked})` : ''}
          </Button>
          <Link href={`/teacher/scan?session=${s.id}`} className={buttonClasses('outline', 'md')}>
            <QrCode className="h-4 w-4" /> {t.scanCodes}
          </Link>
        </div>
      )}
      {active.length === 0 ? (
        <EmptyState title={t.nobodyBooked} />
      ) : (
        <div className="space-y-2">
          {active.map((p) => (
            <Card key={p.bookingId} className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} src={p.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.level ?? t.levelNotSet} · {p.isFirstVisit ? t.firstVisit : t.visitsBefore(p.visitsBefore)}
                  </p>
                </div>
                {p.kind === 'TRIAL' && <Badge tone="zest">{t.trial}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-1 gap-1.5">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      disabled={!d.canMarkAttendance || mark.isPending}
                      onClick={() => mark.mutate({ bookingId: p.bookingId, status: o.value })}
                      aria-pressed={p.attendance?.status === o.value}
                      className={cn(
                        'h-10 flex-1 rounded-xl border text-sm font-semibold transition disabled:opacity-50',
                        p.attendance?.status === o.value ? o.active : 'border-line bg-white hover:border-brand-300',
                      )}
                    >
                      {t[o.label]}
                    </button>
                  ))}
                </div>
                {d.feedbackEnabled && started && (
                  <Button size="sm" variant={p.feedback ? 'secondary' : 'outline'} leftIcon={<MessageSquareQuote className="h-4 w-4" />} onClick={() => setFeedbackFor(p)}>
                    {p.feedback ? t.editFeedback : t.feedback}
                  </Button>
                )}
              </div>
              {p.attendance && (
                <p className="text-[11px] text-subtle">
                  {p.attendance.method === 'QR' ? t.checkedInQr : t.markedBy[p.attendance.method]} · {fmt.time(p.attendance.markedAt)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
      {feedbackFor && (
        <FeedbackDialog bookingId={feedbackFor.bookingId} clientName={feedbackFor.firstName} endpoint="teacher" initial={feedbackFor.feedback} onClose={() => setFeedbackFor(null)} onSaved={() => void refresh()} />
      )}
    </div>
  );
}
