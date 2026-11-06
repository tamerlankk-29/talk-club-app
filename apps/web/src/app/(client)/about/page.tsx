'use client';

import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Avatar, Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/markdown';
import { useAuth } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { clubMessages } from '@/lib/i18n/messages/club';
import { useClub, useTeachers } from '@/lib/queries';

export default function AboutPage() {
  const m = useT(clubMessages);
  const { status } = useAuth();
  const { data: club } = useClub();
  const { data: teachers } = useTeachers();
  return (
    <div className="space-y-6 pt-5">
      <PageHeader back title={m.aboutTitle} />
      <Card>{club ? <Markdown className="prose-club text-[15px]">{club.content.about}</Markdown> : <Skeleton className="h-40 w-full" />}</Card>

      {club && club.content.howItWorks.length > 0 && (
        <Section title={m.howItWorks}>
          <ol className="space-y-3">
            {club.content.howItWorks.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-700 font-display text-sm font-semibold text-white">{i + 1}</span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {club && club.plans.length > 0 && (
        <Section title={m.memberships}>
          <div className="grid grid-cols-2 gap-3">
            {club.plans.map((p) => (
              <div key={p.id} className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
                <p className="font-display font-semibold tracking-wide">{p.name}</p>
                <p className="text-sm text-muted">
                  {m.planTerms(p.visits, p.validityDays)}
                </p>
                <p className="mt-2 font-display text-lg font-semibold">{fmt.money(p.price)}</p>
              </div>
            ))}
          </div>
          {club.policies.trial.enabled && <p className="text-sm text-muted">{m.trialPrice(fmt.money(club.policies.trial.price))}</p>}
        </Section>
      )}

      {teachers && teachers.length > 0 && (
        <Section title={m.teachers} action={<Link href="/teachers" className="text-sm font-semibold text-brand-700">{m.all}</Link>}>
          <div className="grid grid-cols-2 gap-3">
            {teachers.map((t) => (
              <Link key={t.id} href={`/teachers/${t.id}`} className="rounded-3xl bg-white p-4 text-center shadow-card ring-1 ring-line/70">
                <Avatar name={t.name} src={t.photoUrl} size="lg" className="mx-auto" />
                <p className="mt-2 font-semibold">{t.name}</p>
                <p className="text-xs text-muted">{t.country}</p>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {status === 'anonymous' && (
        <Link href="/register" className={buttonClasses('primary', 'lg', 'w-full')}>
          {m.join}
        </Link>
      )}
    </div>
  );
}
