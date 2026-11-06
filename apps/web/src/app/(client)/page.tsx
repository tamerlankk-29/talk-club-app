'use client';

import { ArrowRight, CalendarDays, CreditCard, Flame, History, Megaphone, Ticket, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { BellLink } from '@/components/client/client-shell';
import { MembershipCard, NoMembershipCard } from '@/components/client/membership-card';
import { ConnectionProblem, SplashScreen } from '@/components/client/require-auth';
import { SessionAction, SessionMiniCard } from '@/components/client/session-card';
import { Welcome } from '@/components/client/welcome';
import { buttonClasses } from '@/components/ui/button';
import { Avatar, ErrorState, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Card, Section } from '@/components/ui/layout';
import { useAuth } from '@/lib/auth';
import { clubNow, fmt } from '@/lib/format';
import { useHome } from '@/lib/queries';
import { messagesFor, useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';

export default function HomePage() {
  const { status, user, actingClientId } = useAuth();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'unavailable') return <ConnectionProblem />;
  if (status === 'anonymous') return <Welcome />;
  if (!user?.client && !actingClientId) {
    if (user?.managedClients.length) return <PickProfile />;
    return <StaffNotice />;
  }
  return <Dashboard />;
}

function greeting(): string {
  const h = clubNow().hour;
  const t = messagesFor(homeMessages);
  return h < 12 ? t.goodMorning : h < 18 ? t.goodAfternoon : t.goodEvening;
}

function Dashboard() {
  const { data, isLoading, error, refetch } = useHome();
  const t = useT(homeMessages);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="mt-10" />;
  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between gap-3 pt-5">
        <div className="min-w-0">
          <p className="text-sm text-muted">{greeting()}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-8 w-44" />
          ) : (
            <h1 className="truncate font-display text-[26px] font-semibold leading-tight">{t.hello(data?.greetingName ?? '')}</h1>
          )}
        </div>
        <BellLink />
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-60 w-full rounded-[28px]" />
      ) : data.membership ? (
        <MembershipCard membership={data.membership} />
      ) : (
        <NoMembershipCard trialAvailable={data.trialAvailable} trialPrice={data.trialPrice} />
      )}

      {data?.pendingPayments.map((p) => (
        <InlineAlert
          key={p.id}
          tone="warning"
          icon={<Wallet className="h-5 w-5" />}
          title={t.paymentPending(fmt.money(p.amount))}
          action={
            <Link href={`/payments/${p.id}`} className="text-sm font-semibold underline underline-offset-2">
              {t.viewPayment}
            </Link>
          }
        >
          {p.description}
        </InlineAlert>
      ))}

      {data?.waitlist
        .filter((w) => w.status === 'OFFERED')
        .map((w) => (
          <InlineAlert
            key={w.id}
            tone="zest"
            title={t.placeAvailable}
            action={
              <Link href={`/sessions/${w.session.id}`} className={buttonClasses('primary', 'sm')}>
                {t.bookThePlace}
              </Link>
            }
          >
            {t.placeText(w.session.title, w.session.teacher?.name ?? '', fmt.sessionWhen(w.session.startsAt), w.offerExpiresAt ? fmt.time(w.offerExpiresAt) : t.soon)}
          </InlineAlert>
        ))}

      <Section
        title={t.nextSession}
        action={
          data?.nextBooking && (
            <Link href="/bookings" className="text-sm font-semibold text-brand-700">
              {t.allBookings}
            </Link>
          )
        }
      >
        {isLoading ? (
          <Skeleton className="h-28 w-full rounded-3xl" />
        ) : data?.nextBooking ? (
          <Link href={`/bookings/${data.nextBooking.id}`} className="block">
            <Card className="flex items-center gap-4 transition hover:border-brand-200">
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-700 text-white">
                <span className="text-[11px] font-semibold uppercase">{fmt.weekdayDate(data.nextBooking.session.startsAt).split(',')[0]}</span>
                <span className="font-display text-xl font-semibold leading-none">{data.nextBooking.session.startTime}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {data.nextBooking.session.teacher?.name ?? data.nextBooking.session.title}
                </p>
                <p className="truncate text-sm text-muted">
                  {data.nextBooking.session.levelLabel} · {data.nextBooking.session.title}
                </p>
                <p className="mt-1 text-sm font-medium text-brand-700">
                  {fmt.sessionWhen(data.nextBooking.session.startsAt)}–{data.nextBooking.session.endTime}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-subtle" />
            </Card>
          </Link>
        ) : (
          <Card className="text-center">
            <p className="text-sm text-muted">{t.noUpcoming}</p>
            <Link href="/schedule" className={buttonClasses('primary', 'sm', 'mt-3')}>
              {t.findSession}
            </Link>
          </Card>
        )}
      </Section>

      <div className="grid grid-cols-4 gap-2.5">
        {[
          { href: '/schedule', label: t.quick.book, icon: CalendarDays },
          { href: '/membership', label: t.quick.membership, icon: CreditCard },
          { href: '/attendance', label: t.quick.history, icon: History },
          { href: '/profile', label: t.quick.profile, icon: UserRound },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-3xl bg-white py-4 shadow-card ring-1 ring-line/70 transition hover:ring-brand-200">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold">{label}</span>
          </Link>
        ))}
      </div>

      {data?.recommended && (
        <Section title={t.recommended}>
          <Card className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{fmt.sessionWhen(data.recommended.startsAt)}</p>
                <p className="mt-1 font-semibold">{data.recommended.title}</p>
                <p className="text-sm text-muted">
                  {data.recommended.levelLabel} · {t.seatsLeft(data.recommended.available)}
                </p>
              </div>
              {data.recommended.teacher && <Avatar name={data.recommended.teacher.name} src={data.recommended.teacher.photoUrl} />}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Link href={`/sessions/${data.recommended.id}`} className="text-sm font-semibold text-brand-700">
                {t.details}
              </Link>
              <SessionAction session={data.recommended} />
            </div>
          </Card>
        </Section>
      )}

      {(['today', 'tomorrow'] as const).map((day) =>
        data && data[day].length > 0 ? (
          <Section
            key={day}
            title={day === 'today' ? t.availableToday : t.availableTomorrow}
            action={
              <Link href="/schedule" className="text-sm font-semibold text-brand-700">
                {t.schedule}
              </Link>
            }
          >
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
              {data[day].map((s) => (
                <SessionMiniCard key={s.id} session={s} />
              ))}
            </div>
          </Section>
        ) : null,
      )}

      {data && data.announcements.length > 0 && (
        <Section title={t.news}>
          <div className="space-y-3">
            {data.announcements.map((a) => (
              <Card key={a.id} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zest/40 text-zest-dark">
                  <Megaphone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{a.body}</p>
                  {a.buttonUrl && a.buttonLabel && (
                    <Link href={a.buttonUrl} className="mt-2 inline-block text-sm font-semibold text-brand-700">
                      {a.buttonLabel} →
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {data && (
        <Card className="grid grid-cols-3 divide-x divide-line text-center">
          <div>
            <p className="font-display text-xl font-semibold">{data.stats.attendedThisMonth}</p>
            <p className="text-xs text-muted">{t.sessionsThisMonth}</p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold">{t.hours(Math.round(data.stats.minutesThisMonth / 6) / 10)}</p>
            <p className="text-xs text-muted">{t.speakingEnglish}</p>
          </div>
          <div>
            <p className="inline-flex items-center gap-1 font-display text-xl font-semibold">
              {data.stats.streakWeeks} <Flame className="h-4 w-4 text-orange-500" />
            </p>
            <p className="text-xs text-muted">{t.weekStreak}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function PickProfile() {
  const { user, setActingClient } = useAuth();
  const t = useT(homeMessages);
  return (
    <div className="space-y-5 pt-10">
      <h1 className="font-display text-2xl font-semibold">{t.whoIsBooking}</h1>
      <div className="space-y-3">
        {user?.managedClients.map((c) => (
          <button key={c.id} type="button" onClick={() => setActingClient(c.id)} className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-card ring-1 ring-line/70">
            <Avatar name={`${c.firstName} ${c.lastName ?? ''}`} />
            <span className="font-semibold">{c.firstName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StaffNotice() {
  const { user } = useAuth();
  const t = useT(homeMessages);
  return (
    <div className="space-y-4 pt-16 text-center">
      <Ticket className="mx-auto h-10 w-10 text-brand-700" />
      <h1 className="font-display text-xl font-semibold">{t.welcome(user?.displayName ?? '')}</h1>
      <p className="text-sm text-muted">{t.staffAccount}</p>
      <div className="flex justify-center gap-3">
        {user?.areas.admin && (
          <Link href="/admin" className={buttonClasses('primary')}>
            {t.adminPanel}
          </Link>
        )}
        {user?.areas.teacher && (
          <Link href="/teacher" className={buttonClasses('outline')}>
            {t.teacherPanel}
          </Link>
        )}
      </div>
    </div>
  );
}
