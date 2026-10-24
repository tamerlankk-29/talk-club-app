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
import { clubNow, fmt } from '@/lib/format';

export default function AdminDashboard() {
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
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <AdminPage
      title={`${greeting}, ${user?.displayName.split(' ')[0] ?? ''}`}
      description={`${clubNow().toFormat('cccc, d MMMM')} · Talk Club`}
      actions={
        <>
          {canClients && (
            <Link href="/admin/clients?new=1" className={buttonClasses('outline', 'sm')}>
              <UserPlus className="h-4 w-4" /> New client
            </Link>
          )}
          {canPayments && (
            <Link href="/admin/payments?new=1" className={buttonClasses('outline', 'sm')}>
              <CreditCard className="h-4 w-4" /> Payment request
            </Link>
          )}
          {canSchedule && (
            <Link href="/admin/schedule?new=1" className={buttonClasses('primary', 'sm')}>
              <CalendarCheck2 className="h-4 w-4" /> New session
            </Link>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sessions today"
          loading={!d}
          value={d?.today.sessions ?? 0}
          hint={d ? `${d.today.bookings} of ${d.today.capacity} seats booked · ${Math.round(d.today.occupancy)}% full` : undefined}
          icon={<CalendarCheck2 className="h-5 w-5" />}
          tone="brand"
          href="/admin/schedule"
        />
        <StatCard
          label="Attendance today"
          loading={!d}
          value={d ? `${d.today.attended}` : 0}
          hint={d ? `${d.today.noShows} no-shows · ${d.today.cancellations} cancelled (${d.today.lateCancellations} late)` : undefined}
          icon={<ClipboardCheck className="h-5 w-5" />}
          href="/admin/attendance"
        />
        <StatCard
          label="Active clients"
          loading={!d}
          value={d?.clients.active ?? 0}
          hint={d ? `+${d.clients.newThisWeek} new · ${d.clients.newTrialsThisWeek} trials this week` : undefined}
          icon={<Users className="h-5 w-5" />}
          href="/admin/clients"
        />
        {canFinance ? (
          <StatCard
            label="Revenue this month"
            loading={!d}
            value={fmt.money(d?.finance?.revenue.month ?? 0)}
            hint={d?.finance ? `Today ${fmt.money(d.finance.revenue.today)} · week ${fmt.money(d.finance.revenue.week)}` : undefined}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="success"
            href="/admin/reports"
          />
        ) : (
          <StatCard label="Waitlist" loading={!d} value={d?.waitlist ?? 0} hint="people waiting for a place" icon={<Hourglass className="h-5 w-5" />} />
        )}
      </div>

      {d && (
        <div className="flex flex-wrap gap-2">
          <Alert show={d.pending.payments > 0} href="/admin/payments?status=PENDING" icon={<CreditCard className="h-4 w-4" />} tone="warning">
            {d.pending.payments} pending payment{d.pending.payments === 1 ? '' : 's'} · {fmt.money(d.pending.paymentsAmount)}
          </Alert>
          <Alert show={d.unmarkedAttendance > 0} href="/admin/attendance" icon={<ClipboardCheck className="h-4 w-4" />} tone="danger">
            {d.unmarkedAttendance} session{d.unmarkedAttendance === 1 ? '' : 's'} with unmarked attendance
          </Alert>
          <Alert show={d.clients.membershipsExpiringSoon > 0} href="/admin/memberships?status=EXPIRING" icon={<AlarmClock className="h-4 w-4" />} tone="warning">
            {d.clients.membershipsExpiringSoon} membership{d.clients.membershipsExpiringSoon === 1 ? '' : 's'} expiring soon
          </Alert>
          <Alert show={d.tasks.overdue > 0} href="/admin/tasks" icon={<ListTodo className="h-4 w-4" />} tone="danger">
            {d.tasks.overdue} overdue task{d.tasks.overdue === 1 ? '' : 's'}
          </Alert>
          <Alert show={d.tasks.open > 0 && d.tasks.overdue === 0} href="/admin/tasks" icon={<ListTodo className="h-4 w-4" />} tone="brand">
            {d.tasks.open} open task{d.tasks.open === 1 ? '' : 's'}
          </Alert>
          <Alert show={d.waitlist > 0} href="/admin/bookings" icon={<Hourglass className="h-4 w-4" />} tone="brand">
            {d.waitlist} on waitlists
          </Alert>
          <Alert show={d.clients.newTrialsThisWeek > 0} href="/admin/trials" icon={<Sparkles className="h-4 w-4" />} tone="brand">
            Trials this week: {d.clients.newTrialsThisWeek}
          </Alert>
          <Alert show={d.deletionRequests > 0} href="/admin/data" icon={<ShieldAlert className="h-4 w-4" />} tone="danger">
            {d.deletionRequests} data deletion request{d.deletionRequests === 1 ? '' : 's'}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <Section
          title="Today's sessions"
          className="xl:col-span-3"
          action={
            <Link href="/admin/schedule" className="text-sm font-semibold text-brand-700">
              Open schedule
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
              <p className="p-6 text-center text-sm text-muted">No sessions today.</p>
            ) : (
              d.sessions.map((s) => (
                <Link key={s.id} href={`/admin/sessions/${s.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-brand-50/40">
                  <div className="w-24 shrink-0">
                    <p className="font-display font-semibold">{s.startTime}</p>
                    <p className="text-xs text-muted">until {s.endTime}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="truncate text-sm text-muted">
                      {s.teacher?.name ?? 'No teacher'} · {s.room?.name ?? (s.format === 'ONLINE' ? 'Online' : 'No room')} · {s.levelLabel}
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

        <Section title="Recent activity" className="xl:col-span-2">
          <Card padded={false} className="max-h-[420px] divide-y divide-line/70 overflow-y-auto">
            {!d ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : d.recentActivity.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">No activity yet.</p>
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
        <Section title="Revenue, last 30 days" description={revenue.data ? `${fmt.money(revenue.data.totals.net)} net · ${revenue.data.totals.count} payments` : undefined}>
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
                  <Tooltip formatter={(v) => [fmt.money(Number(v)), 'Net revenue']} />
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
