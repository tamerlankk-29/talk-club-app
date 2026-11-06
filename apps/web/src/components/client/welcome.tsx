'use client';

import { CalendarDays, Clock, MapPin, MessagesSquare, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/icons';
import { buttonClasses } from '@/components/ui/button';
import { Avatar } from '@/components/ui/feedback';
import { fmt } from '@/lib/format';
import { useClub, useTeachers } from '@/lib/queries';
import { Rich, useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/client-shell';
import { LanguageSwitcher } from '@/components/ui/language-switcher';

/** First screen for guests: what Talk Club is, how it works, and the way in. */
export function Welcome() {
  const { data: club } = useClub();
  const { data: teachers } = useTeachers();
  const t = useT(shellMessages);
  const steps = club?.content.howItWorks ?? [];
  const trial = club?.policies.trial;

  return (
    <div className="space-y-8 pb-6">
      <header className="flex items-center justify-between py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="text-sm font-semibold text-brand-700">
            {t.signIn}
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(150deg,var(--color-brand-900),var(--color-brand-700)_60%,var(--color-brand-500))] px-6 pb-8 pt-9 text-white shadow-float">
        <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-zest/25 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-zest" /> {t.badge}
          </span>
          <h1 className="mt-5 font-display text-[34px] font-semibold leading-[1.1]">
            <Rich text={t.heroTitle} tags={{ accent: (c) => <span className="text-zest">{c}</span> }} />
          </h1>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-white/85">
            {club?.club.tagline ?? t.defaultTagline}
            {t.heroSuffix}
          </p>
          <div className="mt-7 grid gap-2.5">
            <Link href="/register" className={buttonClasses('accent', 'lg', 'w-full')}>
              {t.getStarted}
            </Link>
            {trial?.enabled && (
              <Link href="/trial" className={buttonClasses('white', 'lg', 'w-full bg-white/10 text-white shadow-none ring-1 ring-white/30 hover:bg-white/20')}>
                {t.bookTrial(fmt.money(trial.price))}
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          { icon: Users, label: t.upTo(club?.policies.groupSize ?? 7), sub: t.perGroup },
          { icon: Clock, label: t.minutes(club?.policies.sessionDurationMinutes ?? 90), sub: t.perSession },
          { icon: MessagesSquare, label: t.native, sub: t.speakers },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={sub} className="rounded-3xl bg-white p-4 text-center shadow-card ring-1 ring-line/70">
            <Icon className="mx-auto h-6 w-6 text-brand-700" />
            <p className="mt-2 font-display text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted">{sub}</p>
          </div>
        ))}
      </section>

      {steps.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold">{t.howItWorks}</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-700 font-display text-sm font-semibold text-white">{i + 1}</span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {teachers && teachers.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t.meetTeachers}</h2>
            <Link href="/teachers" className="text-sm font-semibold text-brand-700">
              {t.all}
            </Link>
          </div>
          <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
            {teachers.map((teacher) => (
              <Link key={teacher.id} href={`/teachers/${teacher.id}`} className="w-36 shrink-0 rounded-3xl bg-white p-4 text-center shadow-card ring-1 ring-line/70">
                <Avatar name={teacher.name} src={teacher.photoUrl} size="lg" className="mx-auto" />
                <p className="mt-2 truncate font-semibold">{teacher.firstName}</p>
                <p className="truncate text-xs text-muted">{teacher.country}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Link href="/schedule" className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
          <CalendarDays className="h-6 w-6 text-brand-700" />
          <p className="mt-3 font-semibold">{t.schedule}</p>
          <p className="text-xs text-muted">{t.scheduleHint}</p>
        </Link>
        <Link href="/location" className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
          <MapPin className="h-6 w-6 text-brand-700" />
          <p className="mt-3 font-semibold">{t.findUs}</p>
          <p className="text-xs text-muted">{club?.location ? club.location.address : 'Zheltoksan 118'}</p>
        </Link>
      </section>

      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-muted" aria-label={t.aboutNav}>
        <Link href="/about">{t.about}</Link>
        <Link href="/rules">{t.rules}</Link>
        <Link href="/faq">{t.faq}</Link>
        <Link href="/contact">{t.contact}</Link>
        <Link href="/legal/PRIVACY_POLICY">{t.privacy}</Link>
      </nav>
    </div>
  );
}
