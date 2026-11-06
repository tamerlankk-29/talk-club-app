'use client';

import { CalendarClock, Clock, Hourglass, Ticket, Users, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/markdown';
import { useClub } from '@/lib/queries';

export default function RulesPage() {
  const { data: club } = useClub();
  const p = club?.policies;
  const cancellation =
    p?.cancellation.mode === 'HOURS_BEFORE'
      ? `Cancel at least ${p.cancellation.hoursBefore} hours before the session to get your visit back.`
      : `Cancel until ${p?.cancellation.previousDayTime ?? '20:00'} the day before the session to get your visit back.`;

  return (
    <div className="space-y-6 pt-5">
      <PageHeader back title="Club rules" />
      {p ? (
        <div className="grid gap-3">
          <Rule icon={<Clock />} title={`${p.sessionDurationMinutes}-minute sessions`} text="Please arrive a few minutes early — sessions start on time." />
          <Rule icon={<Users />} title={`Up to ${p.groupSize} people per group`} text="Small groups so everyone gets to speak." />
          <Rule icon={<Ticket />} title={`Memberships are valid for ${p.membershipValidityDays} days`} text="One visit = one session. Unused visits expire at the end of the period." />
          <Rule icon={<CalendarClock />} title="Free cancellation" text={cancellation} />
          <Rule icon={<UserX />} title="Late cancellation or no-show" text="The visit is used and not returned." />
          {p.waitlist.enabled && <Rule icon={<Hourglass />} title="Waitlist" text={`When a place opens we offer it to the first person in line for ${p.waitlist.offerMinutes} minutes.`} />}
        </div>
      ) : (
        <Skeleton className="h-60 w-full rounded-3xl" />
      )}
      {club?.content.rules && (
        <Section title="Full rules">
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
