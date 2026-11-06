'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame, GraduationCap, MessageSquareQuote, Share2, Star, Trophy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, ErrorState, ProgressBar, SkeletonList } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';
import { keys, useClub, useProfile } from '@/lib/queries';
import { renderRecap, shareOrDownload } from '@/lib/recap-image';
import { toast, toastError } from '@/components/ui/toast';
import { Rich, useT } from '@/lib/i18n';
import { profileMessages } from '@/lib/i18n/messages/profile';
import { WEEKDAYS } from '@/lib/utils';

const bold = { b: (c: ReactNode) => <span className="font-semibold">{c}</span> };

type Scores = S<'FeedbackScoresDto'>;
const SKILLS: Array<{ key: keyof Scores; color: string }> = [
  { key: 'fluency', color: '#6d28d9' },
  { key: 'vocabulary', color: '#8b5cf6' },
  { key: 'pronunciation', color: '#0ea5e9' },
  { key: 'confidence', color: '#16a34a' },
  { key: 'participation', color: '#f59e0b' },
  { key: 'conversation', color: '#ec4899' },
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
  const t = useT(profileMessages);
  const stats = useQuery({ queryKey: keys.stats, queryFn: () => call(api.GET('/api/my/stats')) });
  const progress = useQuery({ queryKey: keys.progress, queryFn: () => call(api.GET('/api/my/progress')), enabled: club?.policies.feedbackVisible !== false });

  if (stats.error) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} className="mt-10" />;
  const s = stats.data;
  const p = progress.data;
  const hasScores = p && SKILLS.some((k) => p.averages[k.key] !== null);

  return (
    <div className="space-y-6 pt-5">
      <PageHeader back="/profile" title={t.myProgress} />
      {!s ? (
        <SkeletonList count={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Trophy className="h-5 w-5" />} value={s.sessionsAttended} label={t.sessionsAttended} />
            <Stat icon={<Flame className="h-5 w-5" />} value={t.weeks(s.currentStreakWeeks)} label={t.currentStreak} />
            <Stat icon={<Star className="h-5 w-5" />} value={fmt.minutesAsHours(s.totalMinutesSpeaking)} label={t.speakingEnglish} />
            <Stat icon={<Trophy className="h-5 w-5" />} value={`${s.attendanceRate}%`} label={t.attendanceRate} />
            <Stat icon={<Flame className="h-5 w-5" />} value={t.weeks(s.bestStreakWeeks)} label={t.bestStreak} />
            <Stat icon={<GraduationCap className="h-5 w-5" />} value={s.teachersMet} label={t.teachersMet} />
          </div>

          {s.sessionsAttended > 0 && <ShareRecap stats={s} />}

          {s.monthly.length > 0 && (
            <Section title={t.sessionsPerMonth}>
              <Card className="h-52 pl-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid vertical={false} stroke="#ebe7f3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
                    <Tooltip cursor={{ fill: '#f5f3ff' }} formatter={(v) => [v, t.sessionsTooltip]} />
                    <Bar dataKey="attended" fill="#6d28d9" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Section>
          )}

          <Card className="space-y-2 text-sm">
            {s.favoriteTeacher && (
              <p>
                <Rich text={t.favouriteTeacher(s.favoriteTeacher.name, s.favoriteTeacher.sessions)} tags={bold} />
              </p>
            )}
            {s.mostAttendedWeekday && (
              <p>
                <Rich
                  text={s.mostAttendedTime ? t.usualDayTime(WEEKDAYS[s.mostAttendedWeekday], s.mostAttendedTime) : t.usualDay(WEEKDAYS[s.mostAttendedWeekday])}
                  tags={bold}
                />
              </p>
            )}
            <p className="text-muted">
              {t.usageLine(s.visitsUsed, s.visitsPurchased, s.noShows, s.lateCancelled)}
            </p>
          </Card>
        </>
      )}

      {club?.policies.feedbackVisible !== false && (
        <>
          {hasScores && p && (
            <Section title={t.skillsTitle} description={t.skillsHint}>
              <Card className="space-y-3">
                {SKILLS.filter((k) => p.averages[k.key] !== null).map((k) => (
                  <div key={k.key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{t.skills[k.key]}</span>
                      <span className="font-semibold">{p.averages[k.key]?.toFixed(1)}</span>
                    </div>
                    <ProgressBar value={p.averages[k.key] ?? 0} max={5} />
                  </div>
                ))}
              </Card>
            </Section>
          )}

          {p && p.trend.length > 1 && (
            <Section title={t.trend}>
              <Card className="h-56 pl-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={p.trend.map((t) => ({ ...t, label: monthLabel(t.month) }))}>
                    <CartesianGrid vertical={false} stroke="#ebe7f3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} fontSize={12} width={30} />
                    <Tooltip />
                    {SKILLS.slice(0, 4).map((k) => (
                      <Line key={k.key} type="monotone" dataKey={k.key} name={t.skills[k.key]} stroke={k.color} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Section>
          )}

          <Section title={t.teacherFeedback}>
            {progress.isLoading ? (
              <SkeletonList count={2} />
            ) : p && p.feedback.length ? (
              <div className="space-y-3">
                {p.feedback.map((f) => (
                  <Card key={f.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={f.teacher?.name} src={f.teacher?.photoUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{f.teacher?.name ?? t.teacher}</p>
                        <p className="text-xs text-muted">
                          {f.sessionTitle} · {fmt.weekdayDate(f.sessionStartsAt)}
                        </p>
                      </div>
                    </div>
                    {f.comment && <p className="text-sm leading-relaxed">“{f.comment}”</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {SKILLS.filter((k) => f.scores[k.key] !== null).map((k) => (
                        <span key={k.key} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                          {t.skills[k.key]} {f.scores[k.key]}/5
                        </span>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState icon={<MessageSquareQuote className="h-7 w-7" />} title={t.noFeedback} description={t.noFeedbackText} />
            )}
          </Section>

          {p && p.levelHistory.length > 0 && (
            <Section title={t.levelHistory}>
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

function ShareRecap({ stats }: { stats: S<'ClientStatsDto'> }) {
  const t = useT(profileMessages);
  const { data: profile } = useProfile();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderRecap(stats, profile?.firstName ?? '');
      if (await shareOrDownload(blob, 'talk-club-recap.png')) toast.success(t.recapSaved);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" block leftIcon={<Share2 className="h-4 w-4" />} loading={busy} onClick={share}>
      {t.shareRecap}
    </Button>
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
