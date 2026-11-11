import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { hasPermission } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { fullName } from '../../common/utils/names';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { FUNNEL_ORDER, STAGE_LABELS } from '../crm/pipeline.service';
import { SessionReadService } from '../sessions/session-read.service';
import { SettingsService } from '../settings/settings.service';

export type Interval = 'day' | 'week' | 'month';

export interface Range {
  from: Date;
  to: Date;
}

const PAID = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);

/** Aggregations for the dashboard, reports and analytics (club-local periods). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly read: SessionReadService,
    private readonly clock: ClockService,
  ) {}

  async range(from?: string, to?: string, defaultDays = 30): Promise<Range & { tz: string }> {
    const tz = await this.catalog.defaultTimezone();
    const now = DateTime.fromJSDate(this.clock.now(), { zone: tz });
    const end = to ? DateTime.fromISO(to, { zone: tz }).endOf('day') : now.endOf('day');
    const start = from ? DateTime.fromISO(from, { zone: tz }).startOf('day') : end.minus({ days: defaultDays - 1 }).startOf('day');
    return { from: start.toJSDate(), to: end.toJSDate(), tz };
  }

  // ─── Dashboard ───

  async dashboard(viewer: AuthUser) {
    const tz = await this.catalog.defaultTimezone();
    const nowDt = DateTime.fromJSDate(this.clock.now(), { zone: tz });
    const now = nowDt.toJSDate();
    const dayStart = nowDt.startOf('day').toJSDate();
    const dayEnd = nowDt.endOf('day').toJSDate();
    const weekAgo = nowDt.minus({ days: 7 }).toJSDate();
    const crm = await this.settings.get('crm');
    const soon = new Date(now.getTime() + crm.expiringSoonDays * 86_400_000);
    const todaySessions: Prisma.SessionWhereInput = { status: 'SCHEDULED', startsAt: { gte: dayStart, lte: dayEnd } };

    const [
      sessions,
      bookingsByStatus,
      activeClients,
      newClients,
      newTrials,
      expiring,
      pendingPayments,
      openTasks,
      overdueTasks,
      waitlist,
      unmarked,
      deletionRequests,
      recent,
    ] = await Promise.all([
      this.read.findMany(todaySessions),
      this.prisma.booking.groupBy({ by: ['status'], where: { session: todaySessions }, _count: { _all: true } }),
      this.prisma.client.count({ where: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE', expiresAt: { gt: now } } } } }),
      this.prisma.client.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.trial.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE', expiresAt: { gt: now, lte: soon } } }),
      this.prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.crmTask.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.crmTask.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now } } }),
      this.prisma.waitlistEntry.count({ where: { activeSlot: true, session: { startsAt: { gt: now } } } }),
      this.prisma.booking.count({ where: { status: 'BOOKED', session: { status: 'SCHEDULED', endsAt: { lt: now, gte: nowDt.minus({ days: 2 }).toJSDate() } } } }),
      this.prisma.dataRequest.count({ where: { type: 'DELETION', status: 'PENDING' } }),
      this.prisma.clientActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { client: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    const count = (s: string) => bookingsByStatus.find((b) => b.status === s)?._count._all ?? 0;
    const ctx = await this.read.context(sessions.map((s) => s.id));
    const capacity = sessions.reduce((sum, s) => sum + s.capacity, 0);
    const booked = count('BOOKED') + count('ATTENDED') + count('NO_SHOW');

    const finance = hasPermission(viewer, 'finance.view') ? await this.financeSummary() : null;
    return {
      date: nowDt.toISODate() as string,
      today: {
        sessions: sessions.length,
        bookings: booked,
        attended: count('ATTENDED'),
        noShows: count('NO_SHOW'),
        cancellations: count('CANCELLED') + count('LATE_CANCELLED'),
        lateCancellations: count('LATE_CANCELLED'),
        capacity,
        occupancy: pct(booked, capacity),
      },
      clients: { active: activeClients, newThisWeek: newClients, newTrialsThisWeek: newTrials, membershipsExpiringSoon: expiring },
      pending: { payments: pendingPayments._count._all, paymentsAmount: pendingPayments._sum.amount ?? 0 },
      tasks: { open: openTasks, overdue: overdueTasks },
      waitlist,
      unmarkedAttendance: unmarked,
      deletionRequests,
      finance,
      sessions: sessions.map((s) => this.read.toDto(s, ctx)),
      recentActivity: recent.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        createdAt: a.createdAt,
        client: { id: a.client.id, name: fullName(a.client.firstName, a.client.lastName) },
      })),
    };
  }

  // ─── Finance ───

  async financeSummary() {
    const tz = await this.catalog.defaultTimezone();
    const now = DateTime.fromJSDate(this.clock.now(), { zone: tz });
    const periods = {
      today: now.startOf('day').toJSDate(),
      week: now.startOf('week').toJSDate(),
      month: now.startOf('month').toJSDate(),
    };
    const revenueSince = async (since: Date) => {
      const [paid, refunds] = await Promise.all([
        this.prisma.payment.aggregate({ where: { status: { in: [...PAID] }, paidAt: { gte: since } }, _sum: { amount: true } }),
        this.prisma.payment.aggregate({ where: { refundedAt: { gte: since } }, _sum: { refundedAmount: true } }),
      ]);
      return (paid._sum.amount ?? 0) - (refunds._sum.refundedAmount ?? 0);
    };
    const [today, week, month, byProduct, byMethod, pending, refunds] = await Promise.all([
      revenueSince(periods.today),
      revenueSince(periods.week),
      revenueSince(periods.month),
      this.prisma.payment.groupBy({ by: ['productType'], where: { status: { in: [...PAID] }, paidAt: { gte: periods.month } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['methodId'], where: { status: { in: [...PAID] }, paidAt: { gte: periods.month } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.payment.aggregate({ where: { refundedAt: { gte: periods.month } }, _sum: { refundedAmount: true }, _count: { _all: true } }),
    ]);
    const methods = await this.prisma.paymentMethod.findMany();
    return {
      revenue: { today, week, month },
      monthByProduct: byProduct.map((p) => ({ productType: p.productType, amount: p._sum.amount ?? 0, count: p._count._all })),
      monthByMethod: byMethod.map((m) => ({
        method: methods.find((x) => x.id === m.methodId)?.name ?? 'Other',
        code: methods.find((x) => x.id === m.methodId)?.code ?? 'OTHER',
        amount: m._sum.amount ?? 0,
        count: m._count._all,
      })),
      /** Expected revenue: payments requested but not yet confirmed */
      outstanding: { amount: pending._sum.amount ?? 0, count: pending._count._all },
      refunds: { month: refunds._sum.refundedAmount ?? 0, count: refunds._count._all },
    };
  }

  async revenue(range: Range & { tz: string }, interval: Interval) {
    const unit = Prisma.raw(`'${interval}'`);
    const series = await this.prisma.$queryRaw<Array<{ period: Date; revenue: bigint | number; count: bigint | number }>>`
      SELECT date_trunc(${unit}, p.paid_at AT TIME ZONE ${range.tz}) AS period,
             SUM(p.amount) AS revenue, COUNT(*) AS count
      FROM payments p
      WHERE p.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND p.paid_at >= ${range.from} AND p.paid_at <= ${range.to}
      GROUP BY 1 ORDER BY 1`;
    const refunds = await this.prisma.$queryRaw<Array<{ period: Date; refunds: bigint | number }>>`
      SELECT date_trunc(${unit}, p.refunded_at AT TIME ZONE ${range.tz}) AS period, SUM(p.refunded_amount) AS refunds
      FROM payments p
      WHERE p.refunded_at IS NOT NULL AND p.refunded_at >= ${range.from} AND p.refunded_at <= ${range.to}
      GROUP BY 1 ORDER BY 1`;
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const refundMap = new Map(refunds.map((r) => [key(r.period), Number(r.refunds)]));
    const [byPlan, byMethod, pending] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['productType', 'membershipPlanId'],
        where: { status: { in: [...PAID] }, paidAt: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['methodId'],
        where: { status: { in: [...PAID] }, paidAt: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const [plans, methods] = await Promise.all([this.prisma.membershipPlan.findMany(), this.prisma.paymentMethod.findMany()]);
    const points = this.fillSeries(range, interval).map((period) => {
      const row = series.find((s) => key(s.period) === period);
      const revenue = Number(row?.revenue ?? 0);
      const refund = refundMap.get(period) ?? 0;
      return { period, revenue, refunds: refund, net: revenue - refund, count: Number(row?.count ?? 0) };
    });
    const totals = points.reduce((t, p) => ({ revenue: t.revenue + p.revenue, refunds: t.refunds + p.refunds, net: t.net + p.net, count: t.count + p.count }), {
      revenue: 0,
      refunds: 0,
      net: 0,
      count: 0,
    });
    return {
      interval,
      from: range.from,
      to: range.to,
      series: points,
      byProduct: byPlan.map((p) => ({
        label: p.productType === 'MEMBERSHIP' ? (plans.find((x) => x.id === p.membershipPlanId)?.name ?? 'Membership') : p.productType === 'TRIAL' ? 'Trial sessions' : p.productType === 'GIFT_CERTIFICATE' ? 'Gift certificates' : 'Other',
        productType: p.productType,
        amount: p._sum.amount ?? 0,
        count: p._count._all,
      })),
      byMethod: byMethod.map((m) => ({ label: methods.find((x) => x.id === m.methodId)?.name ?? 'Other', amount: m._sum.amount ?? 0, count: m._count._all })),
      totals: { ...totals, pending: pending._sum.amount ?? 0, pendingCount: pending._count._all },
    };
  }

  private fillSeries(range: Range & { tz: string }, interval: Interval): string[] {
    const out: string[] = [];
    let cursor = DateTime.fromJSDate(range.from, { zone: range.tz }).startOf(interval === 'week' ? 'week' : interval);
    const end = DateTime.fromJSDate(range.to, { zone: range.tz });
    while (cursor <= end && out.length < 400) {
      out.push(cursor.toFormat('yyyy-MM-dd'));
      cursor = cursor.plus({ [`${interval}s`]: 1 });
    }
    return out;
  }

  // ─── Clients ───

  async clients(range: Range & { tz: string }) {
    const now = this.clock.now();
    const crm = await this.settings.get('crm');
    const inactiveCutoff = new Date(now.getTime() - crm.inactiveAfterDays * 86_400_000);
    const [newClients, active, inactive, total, bySource, byCategory, byLevel, returning] = await Promise.all([
      this.prisma.client.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.client.count({ where: { status: 'ACTIVE', memberships: { some: { status: 'ACTIVE', expiresAt: { gt: now } } } } }),
      this.prisma.client.count({ where: { status: 'ACTIVE', lastVisitAt: { lte: inactiveCutoff }, memberships: { none: { status: 'ACTIVE', expiresAt: { gt: now } } } } }),
      this.prisma.client.count({ where: { status: { not: 'ANONYMIZED' } } }),
      this.prisma.client.groupBy({ by: ['sourceId'], where: { createdAt: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
      this.prisma.client.groupBy({ by: ['category'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      this.prisma.client.groupBy({ by: ['levelId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      this.prisma.membership.count({ where: { isRenewal: true, createdAt: { gte: range.from, lte: range.to } } }),
    ]);
    const [sources, levels] = await Promise.all([this.prisma.leadSource.findMany(), this.prisma.level.findMany()]);
    const weekly = await this.prisma.$queryRaw<Array<{ period: Date; count: bigint }>>`
      SELECT date_trunc('week', created_at AT TIME ZONE ${range.tz}) AS period, COUNT(*) AS count
      FROM clients WHERE created_at >= ${range.from} AND created_at <= ${range.to}
      GROUP BY 1 ORDER BY 1`;
    return {
      newClients,
      activeClients: active,
      inactiveClients: inactive,
      totalClients: total,
      returningClients: returning,
      newByWeek: weekly.map((w) => ({ period: w.period.toISOString().slice(0, 10), count: Number(w.count) })),
      bySource: bySource.map((s) => ({ label: sources.find((x) => x.id === s.sourceId)?.name ?? 'Unknown', count: s._count._all })),
      byCategory: byCategory.map((c) => ({ label: c.category, count: c._count._all })),
      byLevel: byLevel.map((l) => ({ label: levels.find((x) => x.id === l.levelId)?.name ?? 'Not set', count: l._count._all })),
    };
  }

  // ─── Memberships ───

  async memberships(range: Range) {
    const now = this.clock.now();
    const [sold, soldByPlan, active, renewal] = await Promise.all([
      this.prisma.membership.count({ where: { createdAt: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } } }),
      this.prisma.membership.groupBy({ by: ['planName'], where: { createdAt: { gte: range.from, lte: range.to } }, _count: { _all: true }, _sum: { price: true } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE', expiresAt: { gt: now } } }),
      this.renewalStats(range),
    ]);
    return {
      sold,
      active,
      expired: renewal.ended,
      renewed: renewal.renewals,
      renewalRate: renewal.rate,
      byPlan: soldByPlan.map((p) => ({ label: p.planName, count: p._count._all, revenue: p._sum.price ?? 0 })),
    };
  }

  /**
   * Renewal rate = renewals ÷ (renewals + memberships that ran out with no newer
   * membership). Clients usually renew before the old membership expires, so
   * dividing by "expired in the period" alone overstates it (even above 100%).
   */
  private async renewalStats(range: Range): Promise<{ renewals: number; ended: number; churned: number; rate: number }> {
    const now = this.clock.now();
    const end = range.to < now ? range.to : now;
    const [renewals, ended] = await Promise.all([
      this.prisma.membership.count({ where: { isRenewal: true, createdAt: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } } }),
      this.prisma.membership.findMany({
        where: { expiresAt: { gte: range.from, lte: end }, status: { not: 'CANCELLED' } },
        select: { clientId: true, startsAt: true },
      }),
    ]);
    let churned = 0;
    if (ended.length) {
      const all = await this.prisma.membership.findMany({
        where: { clientId: { in: [...new Set(ended.map((e) => e.clientId))] }, status: { not: 'CANCELLED' } },
        select: { clientId: true, startsAt: true },
      });
      for (const e of ended) {
        if (!all.some((m) => m.clientId === e.clientId && m.startsAt > e.startsAt)) churned += 1;
      }
    }
    return { renewals, ended: ended.length, churned, rate: pct(renewals, renewals + churned) };
  }

  // ─── Sessions ───

  async sessions(range: Range & { tz: string }) {
    const now = this.clock.now();
    const where: Prisma.SessionWhereInput = { startsAt: { gte: range.from, lte: range.to < now ? range.to : now } };
    const [held, cancelled, capacity, bookings] = await Promise.all([
      this.prisma.session.count({ where: { ...where, status: 'SCHEDULED' } }),
      this.prisma.session.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.session.aggregate({ where: { ...where, status: 'SCHEDULED' }, _sum: { capacity: true } }),
      this.prisma.booking.groupBy({ by: ['status'], where: { session: { ...where, status: 'SCHEDULED' } }, _count: { _all: true } }),
    ]);
    const count = (s: string) => bookings.find((b) => b.status === s)?._count._all ?? 0;
    const attended = count('ATTENDED');
    const noShows = count('NO_SHOW');
    const seatTaking = attended + noShows + count('BOOKED');
    const cancelledBookings = count('CANCELLED') + count('LATE_CANCELLED');
    const byWeekday = await this.prisma.$queryRaw<Array<{ weekday: number; sessions: bigint; attended: bigint }>>`
      SELECT EXTRACT(ISODOW FROM s.starts_at AT TIME ZONE ${range.tz})::int AS weekday,
             COUNT(DISTINCT s.id) AS sessions,
             COUNT(b.id) FILTER (WHERE b.status = 'ATTENDED') AS attended
      FROM sessions s LEFT JOIN bookings b ON b.session_id = s.id
      WHERE s.status = 'SCHEDULED' AND s.starts_at >= ${range.from} AND s.starts_at <= ${range.to < now ? range.to : now}
      GROUP BY 1 ORDER BY 1`;
    const byTime = await this.prisma.$queryRaw<Array<{ time: string; sessions: bigint; attended: bigint }>>`
      SELECT to_char(s.starts_at AT TIME ZONE ${range.tz}, 'HH24:MI') AS time,
             COUNT(DISTINCT s.id) AS sessions,
             COUNT(b.id) FILTER (WHERE b.status = 'ATTENDED') AS attended
      FROM sessions s LEFT JOIN bookings b ON b.session_id = s.id
      WHERE s.status = 'SCHEDULED' AND s.starts_at >= ${range.from} AND s.starts_at <= ${range.to < now ? range.to : now}
      GROUP BY 1 ORDER BY 1`;
    return {
      sessionsHeld: held,
      sessionsCancelled: cancelled,
      averageAttendance: held ? Math.round((attended / held) * 10) / 10 : 0,
      capacityUtilization: pct(seatTaking, capacity._sum.capacity ?? 0),
      cancellationRate: pct(cancelledBookings, seatTaking + cancelledBookings),
      lateCancellationRate: pct(count('LATE_CANCELLED'), seatTaking + cancelledBookings),
      noShowRate: pct(noShows, attended + noShows),
      totals: { attended, noShows, cancelled: count('CANCELLED'), lateCancelled: count('LATE_CANCELLED') },
      byWeekday: byWeekday.map((w) => ({ weekday: w.weekday, sessions: Number(w.sessions), attended: Number(w.attended) })),
      byTime: byTime.map((t) => ({ time: t.time, sessions: Number(t.sessions), attended: Number(t.attended) })),
    };
  }

  // ─── Teachers ───

  async teachers(range: Range, viewer: AuthUser) {
    const now = this.clock.now();
    const to = range.to < now ? range.to : now;
    const rows = await this.prisma.$queryRaw<
      Array<{ teacher_id: string; sessions: bigint; capacity: bigint; attended: bigint; no_shows: bigint; booked: bigint; feedback: bigint }>
    >`
      SELECT s.teacher_id,
             COUNT(DISTINCT s.id) AS sessions,
             (SELECT COALESCE(SUM(s2.capacity), 0) FROM sessions s2
               WHERE s2.teacher_id = s.teacher_id AND s2.status = 'SCHEDULED' AND s2.starts_at >= ${range.from} AND s2.starts_at <= ${to}) AS capacity,
             COUNT(b.id) FILTER (WHERE b.status = 'ATTENDED') AS attended,
             COUNT(b.id) FILTER (WHERE b.status = 'NO_SHOW') AS no_shows,
             COUNT(b.id) FILTER (WHERE b.active_slot IS TRUE) AS booked,
             COUNT(f.id) AS feedback
      FROM sessions s
      LEFT JOIN bookings b ON b.session_id = s.id
      LEFT JOIN teacher_feedback f ON f.booking_id = b.id
      WHERE s.status = 'SCHEDULED' AND s.teacher_id IS NOT NULL AND s.starts_at >= ${range.from} AND s.starts_at <= ${to}
      GROUP BY s.teacher_id`;
    const teachers = await this.prisma.teacher.findMany();
    const canSeeRates = hasPermission(viewer, 'teachers.view_rates');
    return rows
      .map((r) => {
        const t = teachers.find((x) => x.id === r.teacher_id);
        const sessions = Number(r.sessions);
        const attended = Number(r.attended);
        const noShows = Number(r.no_shows);
        return {
          teacherId: r.teacher_id,
          name: t ? fullName(t.firstName, t.lastName) : 'Unknown',
          sessions,
          attended,
          averageAttendance: sessions ? Math.round((attended / sessions) * 10) / 10 : 0,
          utilization: pct(Number(r.booked), Number(r.capacity)),
          noShowRate: pct(noShows, attended + noShows),
          feedbackGiven: Number(r.feedback),
          payout: canSeeRates && t?.sessionRate ? t.sessionRate * sessions : null,
        };
      })
      .sort((a, b) => b.sessions - a.sessions);
  }

  // ─── Funnel & KPIs ───

  async funnel(range: Range) {
    const inRange = { gte: range.from, lte: range.to };
    const [leads, trialsRequested, trialsBooked, trialsAttended, firstMemberships, renewals, stageCounts] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: inRange } }),
      this.prisma.trial.count({ where: { createdAt: inRange } }),
      this.prisma.trial.count({ where: { createdAt: inRange, status: { in: ['SCHEDULED', 'ATTENDED', 'NO_SHOW'] } } }),
      this.prisma.trial.count({ where: { createdAt: inRange, status: 'ATTENDED' } }),
      this.prisma.membership.count({ where: { createdAt: inRange, isRenewal: false, status: { not: 'CANCELLED' } } }),
      this.prisma.membership.count({ where: { createdAt: inRange, isRenewal: true, status: { not: 'CANCELLED' } } }),
      this.prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
    ]);
    const steps = [
      { key: 'leads', label: 'Leads', count: leads },
      { key: 'trials', label: 'Trials booked', count: trialsBooked },
      { key: 'trialAttendance', label: 'Trials attended', count: trialsAttended },
      { key: 'memberships', label: 'First memberships', count: firstMemberships },
      { key: 'renewals', label: 'Renewals', count: renewals },
    ];
    return {
      steps: steps.map((s, i) => ({ ...s, conversionFromPrevious: i === 0 ? null : pct(s.count, steps[i - 1].count) })),
      trialsRequested,
      pipeline: FUNNEL_ORDER.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
        count: stageCounts.find((c) => c.stage === stage)?._count._all ?? 0,
      })),
    };
  }

  async kpis(range: Range & { tz: string }) {
    const now = this.clock.now();
    const inRange = { gte: range.from, lte: range.to };
    const lengthMs = range.to.getTime() - range.from.getTime();
    const previous = { gte: new Date(range.from.getTime() - lengthMs), lt: range.from };
    const [
      activeMembers,
      registrations,
      trialsAttended,
      trialConverted,
      firstMemberships,
      renewal,
      revenue,
      payingClients,
      attendedBookings,
      visitingClients,
      sessionsStats,
      prevActiveClients,
      byPlan,
    ] = await Promise.all([
      this.prisma.client.count({ where: { memberships: { some: { status: 'ACTIVE', expiresAt: { gt: now } } } } }),
      this.prisma.client.count({ where: { createdAt: inRange } }),
      this.prisma.trial.count({ where: { attendedAt: inRange } }),
      this.prisma.trial.count({ where: { attendedAt: inRange, OR: [{ outcome: 'PURCHASED' }, { client: { memberships: { some: { status: { not: 'CANCELLED' } } } } }] } }),
      this.prisma.membership.count({ where: { createdAt: inRange, isRenewal: false, status: { not: 'CANCELLED' } } }),
      this.renewalStats(range),
      this.prisma.payment.aggregate({ where: { status: { in: [...PAID] }, paidAt: inRange }, _sum: { amount: true, refundedAmount: true } }),
      this.prisma.payment.groupBy({ by: ['clientId'], where: { status: { in: [...PAID] }, paidAt: inRange } }),
      this.prisma.booking.count({ where: { status: 'ATTENDED', session: { startsAt: inRange } } }),
      this.prisma.booking.groupBy({ by: ['clientId'], where: { status: 'ATTENDED', session: { startsAt: inRange } } }),
      this.sessions(range),
      this.prisma.booking.groupBy({ by: ['clientId'], where: { status: 'ATTENDED', session: { startsAt: previous } } }),
      this.prisma.payment.groupBy({ by: ['membershipPlanId'], where: { status: { in: [...PAID] }, paidAt: inRange, productType: 'MEMBERSHIP' }, _sum: { amount: true } }),
    ]);
    const prevIds = new Set(prevActiveClients.map((c) => c.clientId));
    const retainedCount = visitingClients.filter((c) => prevIds.has(c.clientId)).length;
    const netRevenue = (revenue._sum.amount ?? 0) - (revenue._sum.refundedAmount ?? 0);
    const plans = await this.prisma.membershipPlan.findMany();
    return {
      from: range.from,
      to: range.to,
      activeMembers,
      newRegistrations: registrations,
      trialConversion: pct(trialConverted, trialsAttended),
      membershipConversion: pct(firstMemberships, registrations),
      renewalRate: renewal.rate,
      averageRevenuePerClient: payingClients.length ? Math.round(netRevenue / payingClients.length) : 0,
      averageVisitsPerClient: visitingClients.length ? Math.round((attendedBookings / visitingClients.length) * 10) / 10 : 0,
      sessionOccupancy: sessionsStats.capacityUtilization,
      noShowRate: sessionsStats.noShowRate,
      cancellationRate: sessionsStats.cancellationRate,
      clientRetention: pct(retainedCount, prevIds.size),
      revenue: netRevenue,
      revenuePerSession: sessionsStats.sessionsHeld ? Math.round(netRevenue / sessionsStats.sessionsHeld) : 0,
      revenueByMembership: byPlan.map((p) => ({ label: plans.find((x) => x.id === p.membershipPlanId)?.name ?? 'Other', amount: p._sum.amount ?? 0 })),
    };
  }
}
