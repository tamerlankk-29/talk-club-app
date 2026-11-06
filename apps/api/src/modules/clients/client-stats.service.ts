import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ClockService } from '../../common/clock/clock.service';
import { fullName } from '../../common/utils/names';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { CREDIT_TYPES, USAGE_TYPES } from '../memberships/membership-ledger.service';
import { ClientStatsDto, MonthlyAttendanceDto } from './dto/client-stats.dto';

export { ClientStatsDto, MonthlyAttendanceDto };

/** Client statistics — computed from bookings and the visit ledger, never stored by hand. */
@Injectable()
export class ClientStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly clock: ClockService,
  ) {}

  async stats(clientId: string): Promise<ClientStatsDto> {
    const tz = await this.catalog.defaultTimezone();
    const now = this.clock.now();
    const [byStatus, upcoming, attended, ledger] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], where: { clientId }, _count: { _all: true } }),
      this.prisma.booking.count({ where: { clientId, status: 'BOOKED', session: { startsAt: { gt: now } } } }),
      this.prisma.booking.findMany({
        where: { clientId, status: 'ATTENDED' },
        select: {
          session: {
            select: { startsAt: true, endsAt: true, teacher: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
        orderBy: { session: { startsAt: 'desc' } },
        take: 2000,
      }),
      this.prisma.membershipTransaction.groupBy({
        by: ['type'],
        where: { membership: { clientId } },
        _sum: { delta: true },
      }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const attendedCount = count('ATTENDED');
    const noShows = count('NO_SHOW');

    const teacherCounts = new Map<string, { id: string; name: string; sessions: number }>();
    const weekdayCounts = new Map<number, number>();
    const timeCounts = new Map<string, number>();
    const months = new Map<string, { attended: number; minutes: number }>();
    const weeks = new Set<string>();
    let totalMinutes = 0;
    for (const { session } of attended) {
      const local = DateTime.fromJSDate(session.startsAt, { zone: tz });
      const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000);
      totalMinutes += minutes;
      if (session.teacher) {
        const t = teacherCounts.get(session.teacher.id) ?? { id: session.teacher.id, name: fullName(session.teacher.firstName, session.teacher.lastName), sessions: 0 };
        t.sessions += 1;
        teacherCounts.set(session.teacher.id, t);
      }
      weekdayCounts.set(local.weekday, (weekdayCounts.get(local.weekday) ?? 0) + 1);
      const time = local.toFormat('HH:mm');
      timeCounts.set(time, (timeCounts.get(time) ?? 0) + 1);
      const month = local.toFormat('yyyy-MM');
      const m = months.get(month) ?? { attended: 0, minutes: 0 };
      m.attended += 1;
      m.minutes += minutes;
      months.set(month, m);
      weeks.add(`${local.weekYear}-${local.weekNumber}`);
    }

    // Streak: consecutive ISO weeks with a visit, counting back from this (or last) week.
    let streak = 0;
    let cursor = DateTime.fromJSDate(now, { zone: tz });
    if (!weeks.has(`${cursor.weekYear}-${cursor.weekNumber}`)) cursor = cursor.minus({ weeks: 1 });
    while (weeks.has(`${cursor.weekYear}-${cursor.weekNumber}`)) {
      streak += 1;
      cursor = cursor.minus({ weeks: 1 });
    }

    const monthly: MonthlyAttendanceDto[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const key = DateTime.fromJSDate(now, { zone: tz }).minus({ months: i }).toFormat('yyyy-MM');
      monthly.push({ month: key, attended: months.get(key)?.attended ?? 0, minutes: months.get(key)?.minutes ?? 0 });
    }
    const top = <K>(map: Map<K, number>): K | null =>
      [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    let credited = 0;
    let used = 0;
    for (const l of ledger) {
      if (CREDIT_TYPES.includes(l.type)) credited += l._sum.delta ?? 0;
      else if (USAGE_TYPES.includes(l.type)) used -= l._sum.delta ?? 0;
    }

    return {
      sessionsAttended: attendedCount,
      sessionsBooked: byStatus.reduce((sum, b) => sum + b._count._all, 0),
      upcoming,
      noShows,
      cancelled: count('CANCELLED'),
      lateCancelled: count('LATE_CANCELLED'),
      attendanceRate: attendedCount + noShows ? Math.round((attendedCount / (attendedCount + noShows)) * 100) : 0,
      visitsPurchased: credited,
      visitsUsed: Math.max(0, used),
      currentStreakWeeks: streak,
      totalMinutesSpeaking: totalMinutes,
      favoriteTeacher: [...teacherCounts.values()].sort((a, b) => b.sessions - a.sessions)[0] ?? null,
      mostAttendedWeekday: top(weekdayCounts),
      mostAttendedTime: top(timeCounts),
      thisMonth: monthly[monthly.length - 1],
      monthly,
      firstVisitAt: attended.length ? attended[attended.length - 1].session.startsAt : null,
      lastVisitAt: attended[0]?.session.startsAt ?? null,
    };
  }
}
