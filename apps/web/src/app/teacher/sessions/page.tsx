'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TeacherSessionCard } from '@/components/teacher/teacher-session-card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { SegmentedControl } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';

export default function TeacherSessions() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['teacher', 'sessions', scope],
    queryFn: () => call(api.GET('/api/teacher/sessions', { params: { query: { scope } } })),
  });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">My sessions</h1>
      <SegmentedControl
        className="w-full [&>button]:flex-1"
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
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
        <EmptyState title={scope === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'} />
      )}
    </div>
  );
}
