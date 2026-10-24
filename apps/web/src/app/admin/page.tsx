'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  CalendarCheck2,
  ClipboardCheck,
  CreditCard,
  Hourglass,
  ListTodo,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AdminPage } from '@/components/admin/page';
import { buttonClasses } from '@/components/ui/button';
import { ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card, Section, StatCard } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { useAuth, useCan } from '@/lib/auth';
import { clubNow, fmt, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { dashboardMessages } from '@/lib/i18n/messages/admin/dashboard';

export default function AdminDashboard() {
  const t = useT(dashboardMessages);
  const { user } = useAuth();
  const canFinance = useCan('finance.view');
  const canSchedule = useCan('schedule.manage');
  const canClients = useCan('clients.manage');
  const canPayments = useCan('payments.manage');
  const dashboard = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => call(api.GET('/api/admin/dashboard')), refetchInterval: 60_000 });
  const from = clubNow().minus({ days: 29 }).startOf('day').toUTC().toISO()!;
  const to = clubNow().endOf('day').toUTC().toISO()!;
  const revenue = useQuery({
    queryKey: ['admin', 'reports', 'revenue', 'dashboard'],
    queryFn: () => call(api.GET('/api/admin/reports/revenue', { params: { query: { interval: 'day', from, to } } })),
    enabled: canFinance,
  });

  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;
  const d = dashboard.data;
  const hour = clubNow().hour;
  const greeting = hour < 12 ? t.goodMorning : hour < 18 ? t.goodAfternoon : t.goodEvening;

  return (
    <AdminPage
      title={`${greeting}, ${user?.displayName.split(' ')[0] ?? ''}`}
      description={`${formatDate(clubNow(), 'cccc, d MMMM')} · Talk Club`}
      actions={
        <>
          {canClients && (
            <Link href="/admin/clients?new=1" className={buttonClasses('outline', 'sm')}>
              <UserPlus className="h-4 w-4" /> {t.newClient}
            </Link>
          )}
          {canPayments && (
            <Link href="/admin/payments?new=1" className={buttonClasses('outline', 'sm')}>
              <CreditCard className="h-4 w-4" /> {t.paymentRequest}
            </Link>
          )}
          {canSchedule && (
            <Link href="/admin/schedule?new=1" className={buttonClasses('primary', 'sm')}>
              <CalendarCheck2 className="h-4 w-4" /> {t.newSession}
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t.sessionsToday}
          loading={!d}
          value={d?.today.sessions ?? 0}
          hint={d ? t.seatsBooked(d.today.bookings, d.today.capacity, Math.round(d.today.occupancy)) : undefined}
          icon={<CalendarCheck2 className="h-5 w-5" />}
          tone="brand"
          href="/admin/schedule"
        />
        <StatCard
          label={t.attendanceToday}
          loading={!d}
          value={d ? `${d.today.attended}` : 0}
          hint={d ? t.attendanceHint(d.today.noShows, d.today.cancellations, d.today.lateCancellations) : undefined}
          icon={<ClipboardCheck className="h-5 w-5" />}
          href="/admin/attendance"
        />
        <StatCard
          label={t.activeClients}
          loading={!d}
          value={d?.clients.active ?? 0}
          hint={d ? t.clientsHint(d.clients.newThisWeek, d.clients.newTrialsThisWeek) : undefined}
          icon={<Users className="h-5 w-5" />}
          href="/admin/clients"
        />
        {canFinance ? (
          <StatCard
            label={t.revenueMonth}
            loading={!d}
            value={fmt.money(d?.finance?.revenue.month ?? 0)}
            hint={d?.finance ? t.revenueHint(fmt.money(d.finance.revenue.today), fmt.money(d.finance.revenue.week)) : undefined}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="success"
            href="/admin/reports"
          />
        ) : (
          <StatCard label={t.waitlist} loading={!d} value={d?.waitlist ?? 0} hint={t.waitlistHint} icon={<Hourglass className="h-5 w-5" />} />
        )}
      </div>

      {d && (
        <div className="flex flex-wrap gap-2">
          <Alert show={d.pending.payments > 0} href="/admin/payments?status=PENDING" icon={<CreditCard className="h-4 w-4" />} tone="warning">
            {t.pendingPayments(d.pending.payments, fmt.money(d.pending.paymentsAmount))}
          </Alert>
          <Alert show={d.unmarkedAttendance > 0} href="/admin/attendance" icon={<ClipboardCheck className="h-4 w-4" />} tone="danger">
            {t.unmarked(d.unmarkedAttendance)}
          </Alert>
          <Alert show={d.clients.membershipsExpiringSoon > 0} href="/admin/memberships?status=EXPIRING" icon={<AlarmClock className="h-4 w-4" />} tone="warning">
            {t.expiring(d.clients.membershipsExpiringSoon)}
          </Alert>
          <Alert show={d.tasks.overdue > 0} href="/admin/tasks" icon={<ListTodo className="h-4 w-4" />} tone="danger">
            {t.overdue(d.tasks.overdue)}
          </Alert>
          <Alert show={d.tasks.open > 0 && d.tasks.overdue === 0} href="/admin/tasks" icon={<ListTodo className="h-4 w-4" />} tone="brand">
            {t.openTasks(d.tasks.open)}
          </Alert>
          <Alert show={d.waitlist > 0} href="/admin/bookings" icon={<Hourglass className="h-4 w-4" />} tone="brand">
            {t.onWaitlists(d.waitlist)}
          </Alert>
          <Alert show={d.clients.newTrialsThisWeek > 0} href="/admin/trials" icon={<Sparkles className="h-4 w-4" />} tone="brand">
            {t.trialsWeek(d.clients.newTrialsThisWeek)}
          </Alert>
          <Alert show={d.deletionRequests > 0} href="/admin/data" icon={<ShieldAlert className="h-4 w-4" />} tone="danger">
            {t.deletionRequests(d.deletionRequests)}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <Section
          title={t.todaysSessions}
          className="xl:col-span-3"
          action={
            <Link href="/admin/schedule" className="text-sm font-semibold text-brand-700">
              {t.openSchedule}
            </Link>
          }
        >
          <Card padded={false} className="divide-y divide-line/70">
            {!d ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : d.sessions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">{t.noSessionsToday}</p>
            ) : (
              d.sessions.map((s) => (
                <Link key={s.id} href={`/admin/sessions/${s.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-brand-50/40">
                  <div className="w-24 shrink-0">
                    <p className="font-display font-semibold">{s.startTime}</p>
                    <p className="text-xs text-muted">{t.until(s.endTime)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="truncate text-sm text-muted">
                      {s.teacher?.name ?? t.noTeacher} · {s.room?.name ?? (s.format === 'ONLINE' ? t.online : t.noRoom)} · {s.levelLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {s.booked}/{s.capacity}
                    </p>
                    <StatusBadge status={s.status} />
                  </div>
                </Link>
              ))
            )}
          </Card>
        </Section>

        <Section title={t.recentActivity} className="xl:col-span-2">
          <Card padded={false} className="max-h-[420px] divide-y divide-line/70 overflow-y-auto">
            {!d ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : d.recentActivity.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">{t.noActivity}</p>
            ) : (
              d.recentActivity.map((a) => (
                <Link key={a.id} href={`/admin/clients/${a.client.id}`} className="block px-5 py-3 text-sm hover:bg-brand-50/40">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted">
                    {a.client.name} · {fmt.relative(a.createdAt)}
                  </p>
                </Link>
              ))
            )}
          </Card>
        </Section>
      </div>

      {canFinance && (
        <Section title={t.revenue30} description={revenue.data ? t.revenueTotals(fmt.money(revenue.data.totals.net), revenue.data.totals.count) : undefined}>
          <Card className="h-72 pl-1">
            {revenue.data ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenue.data.series.map((p) => ({ ...p, label: fmt.dateShort(`${p.period}T12:00:00Z`) }))}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6d28d9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6d28d9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#ebe7f3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} tickFormatter={(v: number) => `${Math.round(v / 1000)}k ₸`} />
                  <Tooltip formatter={(v) => [fmt.money(Number(v)), t.netRevenue]} />
                  <Area type="monotone" dataKey="net" stroke="#6d28d9" strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </Card>
        </Section>
      )}
    </AdminPage>
  );
}

function Alert({ show, href, icon, tone, children }: { show: boolean; href: string; icon: ReactNode; tone: 'warning' | 'danger' | 'brand'; children: ReactNode }) {
  if (!show) return null;
  const tones = {
    warning: 'bg-warning-50 text-warning-700 ring-warning-600/15',
    danger: 'bg-danger-50 text-danger-700 ring-danger-600/15',
    brand: 'bg-brand-50 text-brand-800 ring-brand-100',
  };
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition hover:brightness-95 ${tones[tone]}`}>
      {icon}
      {children}
    </Link>
  );
}
