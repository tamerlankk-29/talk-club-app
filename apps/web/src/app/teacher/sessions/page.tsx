'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TeacherSessionCard } from '@/components/teacher/teacher-session-card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { SegmentedControl } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { useT } from '@/lib/i18n';
import { teacherMessages } from '@/lib/i18n/messages/teacher';

export default function TeacherSessions() {
  const t = useT(teacherMessages);
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['teacher', 'sessions', scope],
    queryFn: () => call(api.GET('/api/teacher/sessions', { params: { query: { scope } } })),
  });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">{t.mySessions}</h1>
      <SegmentedControl
        className="w-full [&>button]:flex-1"
        options={[
          { value: 'upcoming', label: t.upcoming },
          { value: 'past', label: t.past },
        ]}
        value={scope}
        onChange={setScope}
      />
      {isLoading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data?.length ? (
        <div className="space-y-3">
          {data.map((s) => (
            <TeacherSessionCard key={s.id} s={s} showDate />
          ))}
        </div>
      ) : (
        <EmptyState title={scope === 'upcoming' ? t.noUpcoming : t.noPast} />
      )}
    </div>
  );
}
