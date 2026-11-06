'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { DateTime } from 'luxon';
import { Suspense, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AdminPage, CHART_COLORS, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/inputs';
import { Card, Section, StatCard, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { toastError } from '@/components/ui/toast';
import { api, call, downloadFile } from '@/lib/api/client';
import { useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { clubNow, CLUB_TZ, fmt } from '@/lib/format';
import { WEEKDAYS_SHORT } from '@/lib/utils';

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

function useRange() {
  const url = useUrlState();
  const preset = url.get('range', '30d');
  const now = clubNow();
  let from: DateTime;
  let to: DateTime = now.endOf('day');
  if (preset === 'month') from = now.startOf('month');
  else if (preset === 'last-month') {
    from = now.minus({ months: 1 }).startOf('month');
    to = now.minus({ months: 1 }).endOf('month');
  } else if (preset === '90d') from = now.minus({ days: 89 }).startOf('day');
  else if (preset === 'custom') {
    from = DateTime.fromISO(url.get('from') || now.minus({ days: 29 }).toISODate()!, { zone: CLUB_TZ }).startOf('day');
    to = DateTime.fromISO(url.get('to') || now.toISODate()!, { zone: CLUB_TZ }).endOf('day');
  } else from = now.minus({ days: 29 }).startOf('day');
  return { url, preset, from: from.toUTC().toISO()!, to: to.toUTC().toISO()!, fromDay: from.toISODate()!, toDay: to.toISODate()!, days: Math.round(to.diff(from, 'days').days) };
}

function Reports() {
  const { url, preset, from, to, fromDay, toDay } = useRange();
  const canFinance = useCan('finance.view');
  const canAnalytics = useCan('analytics.view');
  const canExport = useCan('data.export');
  const tab = url.get('tab', canAnalytics ? 'overview' : 'revenue');
  const exportFile = (dataset: string) => downloadFile(`/api/admin/exports/${dataset}?format=xlsx&from=${from}&to=${to}`, `${dataset}-${fromDay}-${toDay}.xlsx`).catch(toastError);
  return (
    <AdminPage
      title="Reports"
      description={`${fmt.date(from)} – ${fmt.date(to)}`}
      actions={
        canExport && (
          <div className="flex flex-wrap gap-2">
            {canFinance && (
              <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => exportFile('revenue')}>
                Revenue
              </Button>
            )}
            <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => exportFile('attendance')}>
              Attendance
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => exportFile('leads')}>
              Leads
            </Button>
          </div>
        )
      }
    >
      <Toolbar>
        <FilterSelect label="Period" value={preset} onChange={(v) => url.set({ range: v === '30d' ? null : v })}>
          <option value="30d">Last 30 days</option>
          <option value="month">This month</option>
          <option value="last-month">Last month</option>
          <option value="90d">Last 90 days</option>
          <option value="custom">Custom</option>
        </FilterSelect>
        {preset === 'custom' && (
          <>
            <Input type="date" className="h-10 w-40" value={fromDay} onChange={(e) => url.set({ from: e.target.value, range: 'custom' })} aria-label="From" />
            <Input type="date" className="h-10 w-40" value={toDay} onChange={(e) => url.set({ to: e.target.value, range: 'custom' })} aria-label="To" />
          </>
        )}
      </Toolbar>
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v })}>
        <TabsList className="max-w-full">
          {canAnalytics && <TabsTrigger value="overview">Overview</TabsTrigger>}
          {canFinance && <TabsTrigger value="revenue">Revenue</TabsTrigger>}
          {canAnalytics && <TabsTrigger value="clients">Clients</TabsTrigger>}
          {canAnalytics && <TabsTrigger value="memberships">Memberships</TabsTrigger>}
          {canAnalytics && <TabsTrigger value="sessions">Sessions</TabsTrigger>}
          {canAnalytics && <TabsTrigger value="teachers">Teachers</TabsTrigger>}
          {canAnalytics && <TabsTrigger value="funnel">Funnel</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">{tab === 'overview' && <Overview from={from} to={to} />}</TabsContent>
        <TabsContent value="revenue">{tab === 'revenue' && <Revenue from={from} to={to} />}</TabsContent>
        <TabsContent value="clients">{tab === 'clients' && <Clients from={from} to={to} />}</TabsContent>
        <TabsContent value="memberships">{tab === 'memberships' && <Memberships from={from} to={to} />}</TabsContent>
        <TabsContent value="sessions">{tab === 'sessions' && <Sessions from={from} to={to} />}</TabsContent>
        <TabsContent value="teachers">{tab === 'teachers' && <Teachers from={from} to={to} />}</TabsContent>
        <TabsContent value="funnel">{tab === 'funnel' && <Funnel from={from} to={to} />}</TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function ChartCard({ title, children, className = 'h-72' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Section title={title}>
      <Card className={`${className} pl-1`}>{children}</Card>
    </Section>
  );
}

function Overview({ from, to }: { from: string; to: string }) {
  const canFinance = useCan('finance.view');
  const { data, error } = useQuery({ queryKey: ['admin', 'reports', 'kpis', from, to], queryFn: () => call(api.GET('/api/admin/analytics/kpis', { params: { query: { from, to } } })) });
  if (error) return <ErrorState error={error} />;
  const k = data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active members" loading={!k} value={k?.activeMembers ?? 0} />
        <StatCard label="New registrations" loading={!k} value={k?.newRegistrations ?? 0} />
        <StatCard label="Trial → membership" loading={!k} value={k ? pct(k.trialConversion) : 0} />
        <StatCard label="Renewal rate" loading={!k} value={k ? pct(k.renewalRate) : 0} />
        <StatCard label="Session occupancy" loading={!k} value={k ? pct(k.sessionOccupancy) : 0} />
        <StatCard label="No-show rate" loading={!k} value={k ? pct(k.noShowRate) : 0} />
        <StatCard label="Cancellation rate" loading={!k} value={k ? pct(k.cancellationRate) : 0} />
        <StatCard label="Client retention" loading={!k} value={k ? pct(k.clientRetention) : 0} />
        <StatCard label="Visits per client" loading={!k} value={k ? Math.round(k.averageVisitsPerClient * 10) / 10 : 0} />
        <StatCard label="Lead → membership" loading={!k} value={k ? pct(k.membershipConversion) : 0} />
        {canFinance && <StatCard label="Revenue" loading={!k} value={fmt.money(k?.revenue ?? 0)} tone="success" />}
        {canFinance && <StatCard label="Revenue per client" loading={!k} value={fmt.money(k?.averageRevenuePerClient ?? 0)} />}
        {canFinance && <StatCard label="Revenue per session" loading={!k} value={fmt.money(k?.revenuePerSession ?? 0)} />}
      </div>
      {canFinance && k && k.revenueByMembership.length > 0 && (
        <ChartCard title="Revenue by membership">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={k.revenueByMembership}>
              <CartesianGrid vertical={false} stroke="#ebe7f3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmt.money(Number(v))} />
              <Bar dataKey="amount" fill="#6d28d9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function Revenue({ from, to }: { from: string; to: string }) {
  const url = useUrlState();
  const interval = (url.get('interval', 'day') as 'day' | 'week' | 'month') || 'day';
  const { data, error } = useQuery({
    queryKey: ['admin', 'reports', 'revenue', from, to, interval],
    queryFn: () => call(api.GET('/api/admin/reports/revenue', { params: { query: { from, to, interval } } })),
  });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-96 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={fmt.money(data.totals.revenue)} hint={`${data.totals.count} payments`} tone="success" />
        <StatCard label="Refunds" value={fmt.money(data.totals.refunds)} />
        <StatCard label="Net" value={fmt.money(data.totals.net)} tone="brand" />
        <StatCard label="Pending now" value={fmt.money(data.totals.pending)} hint={`${data.totals.pendingCount} requests`} tone="warning" />
      </div>
      <div className="flex justify-end">
        <FilterSelect label="Interval" value={interval} onChange={(v) => url.set({ interval: v === 'day' ? null : v })}>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </FilterSelect>
      </div>
      <ChartCard title="Revenue over time">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.series.map((p) => ({ ...p, label: fmt.dateShort(`${p.period}T12:00:00Z`) }))}>
            <CartesianGrid vertical={false} stroke="#ebe7f3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v, name) => [fmt.money(Number(v)), name === 'net' ? 'Net' : name === 'refunds' ? 'Refunds' : 'Revenue']} />
            <Bar dataKey="net" stackId="a" fill="#6d28d9" radius={[6, 6, 0, 0]} />
            <Bar dataKey="refunds" stackId="b" fill="#f59e0b" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="By product">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.byProduct} dataKey="amount" nameKey="label" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {data.byProduct.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt.money(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="By payment method">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.byMethod} dataKey="amount" nameKey="label" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {data.byMethod.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt.money(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function LabelBars({ data, color = '#6d28d9' }: { data: Array<{ label: string; count: number }>; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid horizontal={false} stroke="#ebe7f3" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={120} />
        <Tooltip />
        <Bar dataKey="count" fill={color} radius={[0, 8, 8, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Clients({ from, to }: { from: string; to: string }) {
  const { data, error } = useQuery({ queryKey: ['admin', 'reports', 'clients', from, to], queryFn: () => call(api.GET('/api/admin/reports/clients', { params: { query: { from, to } } })) });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-96 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="New clients" value={data.newClients} tone="brand" />
        <StatCard label="Active" value={data.activeClients} />
        <StatCard label="Returning" value={data.returningClients} />
        <StatCard label="Inactive" value={data.inactiveClients} />
        <StatCard label="Total" value={data.totalClients} />
      </div>
      <ChartCard title="New clients per week">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.newByWeek.map((p) => ({ ...p, label: fmt.dateShort(`${p.period}T12:00:00Z`) }))}>
            <CartesianGrid vertical={false} stroke="#ebe7f3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#6d28d9" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Lead sources">
          <LabelBars data={data.bySource} />
        </ChartCard>
        <ChartCard title="Levels">
          <LabelBars data={data.byLevel} color="#a78bfa" />
        </ChartCard>
        <ChartCard title="Client types">
          <LabelBars data={data.byCategory} color="#0ea5e9" />
        </ChartCard>
      </div>
    </div>
  );
}

function Memberships({ from, to }: { from: string; to: string }) {
  const canFinance = useCan('finance.view');
  const { data, error } = useQuery({ queryKey: ['admin', 'reports', 'memberships', from, to], queryFn: () => call(api.GET('/api/admin/reports/memberships', { params: { query: { from, to } } })) });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-96 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Sold" value={data.sold} tone="brand" />
        <StatCard label="Active now" value={data.active} />
        <StatCard label="Expired" value={data.expired} />
        <StatCard label="Renewed" value={data.renewed} />
        <StatCard label="Renewal rate" value={pct(data.renewalRate)} tone="success" />
      </div>
      <Section title="Sales by plan">
        <Card padded={false} className="divide-y divide-line/70">
          {data.byPlan.map((p) => (
            <div key={p.label} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="font-semibold">{p.label}</span>
              <span>
                {p.count} sold{canFinance ? ` · ${fmt.money(p.revenue)}` : ''}
              </span>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}

function Sessions({ from, to }: { from: string; to: string }) {
  const { data, error } = useQuery({ queryKey: ['admin', 'reports', 'sessions', from, to], queryFn: () => call(api.GET('/api/admin/reports/sessions', { params: { query: { from, to } } })) });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-96 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions held" value={data.sessionsHeld} hint={`${data.sessionsCancelled} cancelled`} tone="brand" />
        <StatCard label="Avg attendance" value={Math.round(data.averageAttendance * 10) / 10} hint="people per session" />
        <StatCard label="Capacity used" value={pct(data.capacityUtilization)} />
        <StatCard label="No-show rate" value={pct(data.noShowRate)} hint={`late cancels ${pct(data.lateCancellationRate)}`} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="By weekday">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byWeekday.map((w) => ({ ...w, label: WEEKDAYS_SHORT[w.weekday] }))}>
              <CartesianGrid vertical={false} stroke="#ebe7f3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
              <Tooltip />
              <Bar dataKey="attended" name="Attended" fill="#6d28d9" radius={[8, 8, 0, 0]} />
              <Bar dataKey="sessions" name="Sessions" fill="#c6f432" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="By start time">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byTime}>
              <CartesianGrid vertical={false} stroke="#ebe7f3" />
              <XAxis dataKey="time" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
              <Tooltip />
              <Bar dataKey="attended" name="Attended" fill="#6d28d9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Card className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
        <div>
          <p className="font-display text-xl font-semibold">{data.totals.attended}</p>
          <p className="text-xs text-muted">attended</p>
        </div>
        <div>
          <p className="font-display text-xl font-semibold">{data.totals.noShows}</p>
          <p className="text-xs text-muted">no-shows</p>
        </div>
        <div>
          <p className="font-display text-xl font-semibold">{data.totals.cancelled}</p>
          <p className="text-xs text-muted">cancelled in time</p>
        </div>
        <div>
          <p className="font-display text-xl font-semibold">{data.totals.lateCancelled}</p>
          <p className="text-xs text-muted">late cancellations</p>
        </div>
      </Card>
    </div>
  );
}

function Teachers({ from, to }: { from: string; to: string }) {
  const canRates = useCan('teachers.view_rates');
  const { data, error } = useQuery({ queryKey: ['admin', 'reports', 'teachers', from, to], queryFn: () => call(api.GET('/api/admin/reports/teachers', { params: { query: { from, to } } })) });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-64 w-full rounded-3xl" />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line bg-canvas/70 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Teacher</th>
            <th className="px-4 py-3">Sessions</th>
            <th className="px-4 py-3">Attended</th>
            <th className="px-4 py-3">Avg / session</th>
            <th className="px-4 py-3">Capacity used</th>
            <th className="px-4 py-3">No-shows</th>
            <th className="px-4 py-3">Feedback</th>
            {canRates && <th className="px-4 py-3">Payout</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((t) => (
            <tr key={t.teacherId} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3 font-semibold">{t.name}</td>
              <td className="px-4 py-3">{t.sessions}</td>
              <td className="px-4 py-3">{t.attended}</td>
              <td className="px-4 py-3">{Math.round(t.averageAttendance * 10) / 10}</td>
              <td className="px-4 py-3">{pct(t.utilization)}</td>
              <td className="px-4 py-3">{pct(t.noShowRate)}</td>
              <td className="px-4 py-3">{t.feedbackGiven}</td>
              {canRates && <td className="px-4 py-3">{t.payout === null ? '—' : fmt.money(t.payout)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funnel({ from, to }: { from: string; to: string }) {
  const { data, error } = useQuery({ queryKey: ['admin', 'reports', 'funnel', from, to], queryFn: () => call(api.GET('/api/admin/reports/funnel', { params: { query: { from, to } } })) });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-64 w-full rounded-3xl" />;
  const max = Math.max(1, ...data.steps.map((s) => s.count));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Conversion funnel" description={`${data.trialsRequested} trial requests in the period`}>
        <Card className="space-y-3">
          {data.steps.map((s) => (
            <div key={s.key}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{s.label}</span>
                <span className="font-semibold">
                  {s.count}
                  {s.conversionFromPrevious !== null && <span className="ml-2 text-xs font-normal text-muted">{pct(s.conversionFromPrevious)} from previous</span>}
                </span>
              </div>
              <div className="h-3 rounded-full bg-brand-50">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </Card>
      </Section>
      <ChartCard title="Pipeline right now" className="h-96">
        <LabelBars data={data.pipeline.map((p) => ({ label: p.label, count: p.count }))} />
      </ChartCard>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}
