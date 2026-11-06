'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame, MessageSquareQuote, Star, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RequireAuth } from '@/components/client/require-auth';
import { Avatar, EmptyState, ErrorState, ProgressBar, SkeletonList } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';
import { keys, useClub } from '@/lib/queries';
import { plural, WEEKDAYS } from '@/lib/utils';

type Scores = S<'FeedbackScoresDto'>;
const SKILLS: Array<{ key: keyof Scores; label: string; color: string }> = [
  { key: 'fluency', label: 'Fluency', color: '#6d28d9' },
  { key: 'vocabulary', label: 'Vocabulary', color: '#8b5cf6' },
  { key: 'pronunciation', label: 'Pronunciation', color: '#0ea5e9' },
  { key: 'confidence', label: 'Confidence', color: '#16a34a' },
  { key: 'participation', label: 'Participation', color: '#f59e0b' },
  { key: 'conversation', label: 'Conversation', color: '#ec4899' },
];

function monthLabel(month: string): string {
  return fmt.dateShort(`${month}-01T12:00:00Z`).split(' ')[1] ?? month;
}

export default function ProgressPage() {
  return (
    <RequireAuth>
      <Progress />
    </RequireAuth>
  );
}

function Progress() {
  const { data: club } = useClub();
  const stats = useQuery({ queryKey: keys.stats, queryFn: () => call(api.GET('/api/my/stats')) });
  const progress = useQuery({ queryKey: keys.progress, queryFn: () => call(api.GET('/api/my/progress')), enabled: club?.policies.feedbackVisible !== false });

  if (stats.error) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} className="mt-10" />;
  const s = stats.data;
  const p = progress.data;
  const hasScores = p && SKILLS.some((k) => p.averages[k.key] !== null);

  return (
    <div className="space-y-6 pt-5">
      <PageHeader back="/profile" title="My progress" />
      {!s ? (
        <SkeletonList count={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Trophy className="h-5 w-5" />} value={s.sessionsAttended} label="sessions attended" />
            <Stat icon={<Flame className="h-5 w-5" />} value={`${s.currentStreakWeeks} wk`} label="current streak" />
            <Stat icon={<Star className="h-5 w-5" />} value={fmt.minutesAsHours(s.totalMinutesSpeaking)} label="speaking English" />
            <Stat icon={<Trophy className="h-5 w-5" />} value={`${s.attendanceRate}%`} label="attendance rate" />
          </div>

          {s.monthly.length > 0 && (
            <Section title="Sessions per month">
              <Card className="h-52 pl-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid vertical={false} stroke="#ebe7f3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
                    <Tooltip cursor={{ fill: '#f5f3ff' }} formatter={(v) => [v, 'Sessions']} />
                    <Bar dataKey="attended" fill="#6d28d9" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Section>
          )}

          <Card className="space-y-2 text-sm">
            {s.favoriteTeacher && (
              <p>
                Favourite teacher: <span className="font-semibold">{s.favoriteTeacher.name}</span> ({plural(s.favoriteTeacher.sessions, 'session')})
              </p>
            )}
            {s.mostAttendedWeekday && (
              <p>
                You usually come on <span className="font-semibold">{WEEKDAYS[s.mostAttendedWeekday]}s</span>
                {s.mostAttendedTime ? ` around ${s.mostAttendedTime}` : ''}.
              </p>
            )}
            <p className="text-muted">
              {s.visitsUsed} of {s.visitsPurchased} purchased visits used · {s.noShows} no-shows · {s.lateCancelled} late cancellations
            </p>
          </Card>
        </>
      )}

      {club?.policies.feedbackVisible !== false && (
        <>
          {hasScores && p && (
            <Section title="Skills" description="Average of your teachers' ratings (1–5)">
              <Card className="space-y-3">
                {SKILLS.filter((k) => p.averages[k.key] !== null).map((k) => (
                  <div key={k.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{k.label}</span>
                      <span className="font-semibold">{p.averages[k.key]?.toFixed(1)}</span>
                    </div>
                    <ProgressBar value={p.averages[k.key] ?? 0} max={5} />
                  </div>
                ))}
              </Card>
            </Section>
          )}

          {p && p.trend.length > 1 && (
            <Section title="Trend">
              <Card className="h-56 pl-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={p.trend.map((t) => ({ ...t, label: monthLabel(t.month) }))}>
                    <CartesianGrid vertical={false} stroke="#ebe7f3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} fontSize={12} width={30} />
                    <Tooltip />
                    {SKILLS.slice(0, 4).map((k) => (
                      <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Section>
          )}

          <Section title="Teacher feedback">
            {progress.isLoading ? (
              <SkeletonList count={2} />
            ) : p && p.feedback.length ? (
              <div className="space-y-3">
                {p.feedback.map((f) => (
                  <Card key={f.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={f.teacher?.name} src={f.teacher?.photoUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{f.teacher?.name ?? 'Teacher'}</p>
                        <p className="text-xs text-muted">
                          {f.sessionTitle} · {fmt.weekdayDate(f.sessionStartsAt)}
                        </p>
                      </div>
                    </div>
                    {f.comment && <p className="text-sm leading-relaxed">“{f.comment}”</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {SKILLS.filter((k) => f.scores[k.key] !== null).map((k) => (
                        <span key={k.key} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                          {k.label} {f.scores[k.key]}/5
                        </span>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState icon={<MessageSquareQuote className="h-7 w-7" />} title="No feedback yet" description="After sessions, teachers can leave you notes and ratings." />
            )}
          </Section>

          {p && p.levelHistory.length > 0 && (
            <Section title="Level history">
              <Card padded={false} className="divide-y divide-line/70">
                {p.levelHistory.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-semibold">{l.level}</span>
                    <span className="text-muted">{fmt.date(l.date)}</span>
                  </div>
                ))}
              </Card>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
      <span className="text-brand-700">{icon}</span>
      <p className="mt-2 font-display text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
