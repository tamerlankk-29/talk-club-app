'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, QrCode } from 'lucide-react';
import Link from 'next/link';
import { TeacherSessionCard } from '@/components/teacher/teacher-session-card';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { api, call } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { clubNow, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { teacherMessages } from '@/lib/i18n/messages/teacher';

export default function TeacherToday() {
  const t = useT(teacherMessages);
  const { user } = useAuth();
  const today = useQuery({
    queryKey: ['teacher', 'sessions', 'today'],
    queryFn: () => call(api.GET('/api/teacher/sessions', { params: { query: { scope: 'today' } } })),
    refetchInterval: 60_000,
  });
  const upcoming = useQuery({
    queryKey: ['teacher', 'sessions', 'upcoming'],
    queryFn: () => call(api.GET('/api/teacher/sessions', { params: { query: { scope: 'upcoming' } } })),
  });
  const hour = clubNow().hour;
  const next = upcoming.data?.filter((s) => s.localDate !== clubNow().toISODate()).slice(0, 3) ?? [];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{formatDate(clubNow(), 'cccc, d MMMM')}</p>
        <h1 className="font-display text-2xl font-semibold">
          {hour < 12 ? t.goodMorning : hour < 18 ? t.goodAfternoon : t.goodEvening}, {user?.teacher?.name.split(' ')[0] ?? user?.displayName}
        </h1>
      </div>
      <Link href="/teacher/scan" className={buttonClasses('primary', 'lg', 'w-full')}>
        <QrCode className="h-5 w-5" /> {t.scanCode}
      </Link>
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t.today}</h2>
        {today.isLoading ? (
          <SkeletonList count={2} />
        ) : today.error ? (
          <ErrorState error={today.error} onRetry={() => today.refetch()} />
        ) : today.data?.length ? (
          today.data.map((s) => <TeacherSessionCard key={s.id} s={s} />)
        ) : (
          <EmptyState icon={<CalendarCheck2 className="h-7 w-7" />} title={t.noSessionsToday} description={t.dayOff} />
        )}
      </section>
      {next.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t.comingUp}</h2>
            <Link href="/teacher/sessions" className="text-sm font-semibold text-brand-700">
              {t.allSessions}
            </Link>
          </div>
          {next.map((s) => (
            <TeacherSessionCard key={s.id} s={s} showDate />
          ))}
        </section>
      )}
    </div>
  );
}
