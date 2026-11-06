'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { BookingCard } from '@/components/client/booking-card';
import { RequireAuth } from '@/components/client/require-auth';
import { EmptyState, ErrorState, ProgressBar, SkeletonList } from '@/components/ui/feedback';
import { Card, PageHeader } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { keys } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { sessionMessages } from '@/lib/i18n/messages/sessions';

export default function AttendancePage() {
  return (
    <RequireAuth>
      <Attendance />
    </RequireAuth>
  );
}

function Attendance() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: keys.attendance, queryFn: () => call(api.GET('/api/my/attendance')) });
  const t = useT(sessionMessages);
  return (
    <div className="space-y-4 pt-5">
      <PageHeader back title={t.attendanceHistory} />
      {isLoading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data ? (
        <>
          <Card className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.attendanceRate}</p>
                <p className="font-display text-3xl font-semibold">{data.summary.attendanceRate}%</p>
              </div>
              <p className="text-sm text-muted">{t.attended(data.summary.attended)}</p>
            </div>
            <ProgressBar value={data.summary.attendanceRate} max={100} />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-2xl bg-canvas p-3">
                <p className="font-display text-lg font-semibold">{data.summary.noShows}</p>
                <p className="text-xs text-muted">{t.noShows}</p>
              </div>
              <div className="rounded-2xl bg-canvas p-3">
                <p className="font-display text-lg font-semibold">{data.summary.cancelled}</p>
                <p className="text-xs text-muted">{t.cancelled}</p>
              </div>
              <div className="rounded-2xl bg-canvas p-3">
                <p className="font-display text-lg font-semibold">{data.summary.lateCancelled}</p>
                <p className="text-xs text-muted">{t.lateCancels}</p>
              </div>
            </div>
          </Card>
          {data.items.length ? (
            <div className="space-y-3">
              {data.items.map((b) => (
                <BookingCard key={b.id} booking={b} showCancellation={false} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<History className="h-7 w-7" />} title={t.noHistory} description={t.noHistoryText} />
          )}
        </>
      ) : null}
    </div>
  );
}
