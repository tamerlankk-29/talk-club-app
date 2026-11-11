'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Flame } from 'lucide-react';
import Link from 'next/link';
import { api, call } from '@/lib/api/client';
import { keys } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { profileMessages } from '@/lib/i18n/messages/profile';
import { cn } from '@/lib/utils';

/** Weekly visit streak on the profile, linking to the full progress page. */
export function StreakCard() {
  const t = useT(profileMessages);
  const { data: s } = useQuery({ queryKey: keys.stats, queryFn: () => call(api.GET('/api/my/stats')) });
  if (!s) return null;
  const active = s.currentStreakWeeks > 0;
  return (
    <Link
      href="/profile/progress"
      className={cn(
        'flex items-center gap-4 rounded-3xl p-5 shadow-card ring-1 transition',
        active ? 'bg-brand-950 text-white ring-brand-950 hover:bg-brand-900' : 'bg-white ring-line/70 hover:ring-brand-200',
      )}
    >
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', active ? 'bg-zest text-brand-950' : 'bg-brand-50 text-brand-700')}>
        <Flame className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold">{active ? t.streakTitle(s.currentStreakWeeks) : t.streakStartTitle}</p>
        <p className={cn('text-sm', active ? 'text-white/75' : 'text-muted')}>
          {!active ? t.streakStart : s.streakAtRisk ? t.streakAtRisk : t.streakKept}
        </p>
        {s.bestStreakWeeks > s.currentStreakWeeks && <p className={cn('mt-1 text-xs', active ? 'text-white/60' : 'text-muted')}>{t.streakBest(s.bestStreakWeeks)}</p>}
      </div>
      <ChevronRight className={cn('h-5 w-5 shrink-0', active ? 'text-white/60' : 'text-muted')} />
    </Link>
  );
}
