'use client';

import { CalendarClock, Clock, Hourglass, Ticket, Users, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/markdown';
import { useT } from '@/lib/i18n';
import { clubMessages } from '@/lib/i18n/messages/club';
import { useClub } from '@/lib/queries';

export default function RulesPage() {
  const m = useT(clubMessages);
  const { data: club } = useClub();
  const p = club?.policies;
  const cancellation =
    p?.cancellation.mode === 'HOURS_BEFORE'
      ? m.cancelHours(p.cancellation.hoursBefore)
      : m.cancelDayBefore(p?.cancellation.previousDayTime ?? '20:00');

  return (
    <div className="space-y-6 pt-5">
      <PageHeader back title={m.rulesTitle} />
      {p ? (
        <div className="grid gap-3">
          <Rule icon={<Clock />} title={m.sessionLength(p.sessionDurationMinutes)} text={m.arriveEarly} />
          <Rule icon={<Users />} title={m.groupSize(p.groupSize)} text={m.groupSizeText} />
          <Rule icon={<Ticket />} title={m.validity(p.membershipValidityDays)} text={m.validityText} />
          <Rule icon={<CalendarClock />} title={m.freeCancellation} text={cancellation} />
          <Rule icon={<UserX />} title={m.lateCancellation} text={m.lateCancellationText} />
          {p.waitlist.enabled && <Rule icon={<Hourglass />} title={m.waitlist} text={m.waitlistText(p.waitlist.offerMinutes)} />}
        </div>
      ) : (
        <Skeleton className="h-60 w-full rounded-3xl" />
      )}
      {club?.content.rules && (
        <Section title={m.fullRules}>
          <Card>
            <Markdown className="prose-club text-[15px]">{club.content.rules}</Markdown>
          </Card>
        </Section>
      )}
    </div>
  );
}

function Rule({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}
