'use client';

import { useQuery } from '@tanstack/react-query';
import { Globe2, GraduationCap, Languages } from 'lucide-react';
import { useParams } from 'next/navigation';
import { SessionCard } from '@/components/client/session-card';
import { Avatar, ErrorState, Skeleton, SkeletonList } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { clubMessages } from '@/lib/i18n/messages/club';
import { keys } from '@/lib/queries';

export default function TeacherPage() {
  const m = useT(clubMessages);
  const { id } = useParams<{ id: string }>();
  const { actingClientId, user } = useAuth();
  const teacher = useQuery({ queryKey: keys.teacher(id), queryFn: () => call(api.GET('/api/public/teachers/{id}', { params: { path: { id } } })) });
  const sessions = useQuery({
    queryKey: [...keys.sessions({ teacherId: id }), actingClientId ?? user?.client?.id ?? 'guest'],
    queryFn: () => call(api.GET('/api/sessions', { params: { query: { teacherId: id, availableOnly: true } } })),
  });

  if (teacher.error) return <ErrorState error={teacher.error} onRetry={() => teacher.refetch()} className="mt-10" />;
  const t = teacher.data;
  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title={m.teacher} />
      <Card className="text-center">
        {t ? (
          <>
            <Avatar name={t.name} src={t.photoUrl} size="xl" className="mx-auto h-24 w-24 text-3xl" />
            <h1 className="mt-3 font-display text-2xl font-semibold">{t.name}</h1>
            {t.headline && <p className="mt-1 text-sm text-muted">{t.headline}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold">
              {t.country && (
                <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1">
                  <Globe2 className="h-3.5 w-3.5" /> {t.country}
                </span>
              )}
              {t.nativeLanguage && (
                <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1">
                  <Languages className="h-3.5 w-3.5" /> {t.nativeLanguage}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-brand-800">
                <GraduationCap className="h-3.5 w-3.5" /> {t.levelsLabel}
              </span>
            </div>
          </>
        ) : (
          <Skeleton className="mx-auto h-40 w-60" />
        )}
      </Card>
      {t?.bio && (
        <Card>
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{t.bio}</p>
          {t.specialization && <p className="mt-3 text-sm text-muted">{m.focus(t.specialization)}</p>}
        </Card>
      )}
      <Section title={t ? m.sessionsWith(t.firstName) : m.sessions}>
        {sessions.isLoading ? (
          <SkeletonList count={2} />
        ) : sessions.data?.length ? (
          <div className="space-y-3">
            {sessions.data.slice(0, 12).map((s) => (
              <SessionCard key={s.id} session={s} showDate />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{m.noOpenSessions}</p>
        )}
      </Section>
    </div>
  );
}
