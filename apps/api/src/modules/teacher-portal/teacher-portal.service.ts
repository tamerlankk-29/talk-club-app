import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { localToUtc } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { SessionReadService } from '../sessions/session-read.service';
import { SettingsService } from '../settings/settings.service';
import { toTeacherPublic } from '../teachers/teachers.service';

/**
 * Teacher panel: own sessions, participants (no payment or financial data),
 * attendance and feedback. Every query is scoped to the signed-in teacher.
 */
@Injectable()
export class TeacherPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: SessionReadService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  private teacherId(user: AuthUser): string {
    if (!user.teacherId) throw new DomainError('FORBIDDEN', { message: 'Your account is not linked to a teacher profile.' });
    return user.teacherId;
  }

  async profile(user: AuthUser) {
    const teacherId = this.teacherId(user);
    const tz = await this.catalog.defaultTimezone();
    const monthStart = DateTime.fromJSDate(this.clock.now(), { zone: tz }).startOf('month').toJSDate();
    const [teacher, sessionsThisMonth, attendance] = await Promise.all([
      this.prisma.teacher.findUniqueOrThrow({
        where: { id: teacherId },
        include: { levelFrom: true, levelTo: true, user: { select: { email: true } } },
      }),
      this.prisma.session.count({ where: { teacherId, status: 'SCHEDULED', startsAt: { gte: monthStart, lte: this.clock.now() } } }),
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { session: { teacherId, startsAt: { gte: monthStart, lte: this.clock.now() } }, status: { in: ['ATTENDED', 'NO_SHOW'] } },
        _count: { _all: true },
      }),
    ]);
    const attended = attendance.find((a) => a.status === 'ATTENDED')?._count._all ?? 0;
    const noShow = attendance.find((a) => a.status === 'NO_SHOW')?._count._all ?? 0;
    return {
      ...toTeacherPublic(teacher),
      email: teacher.user?.email ?? null,
      stats: {
        sessionsThisMonth,
        participantsThisMonth: attended,
        attendanceRate: attended + noShow ? Math.round((attended / (attended + noShow)) * 100) : null,
      },
    };
  }

  async sessions(user: AuthUser, scope: 'today' | 'upcoming' | 'past' | 'week', date?: string) {
    const teacherId = this.teacherId(user);
    const tz = await this.catalog.defaultTimezone();
    const now = this.clock.now();
    const day = date ?? (DateTime.fromJSDate(now, { zone: tz }).toISODate() as string);
    const dayStart = localToUtc(day, '00:00', tz);
    const range =
      scope === 'today'
        ? { gte: dayStart, lt: DateTime.fromJSDate(dayStart, { zone: tz }).plus({ days: 1 }).toJSDate() }
        : scope === 'week'
          ? { gte: DateTime.fromJSDate(dayStart, { zone: tz }).startOf('week').toJSDate(), lt: DateTime.fromJSDate(dayStart, { zone: tz }).endOf('week').toJSDate() }
          : scope === 'upcoming'
            ? { gte: now, lt: new Date(now.getTime() + 21 * 86_400_000) }
            : { gte: new Date(now.getTime() - 60 * 86_400_000), lt: now };
    const rows = await this.read.findMany({ teacherId, startsAt: range, status: 'SCHEDULED' });
    const ordered = scope === 'past' ? [...rows].reverse() : rows;
    const ctx = await this.read.context(ordered.map((r) => r.id));
    const unmarked = await this.prisma.booking.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: ordered.map((r) => r.id) }, status: 'BOOKED' },
      _count: { _all: true },
    });
    return ordered.map((r) => ({
      ...this.read.toDto(r, ctx),
      unmarked: unmarked.find((u) => u.sessionId === r.id)?._count._all ?? 0,
      attendanceFinalized: !!r.attendanceFinalizedAt,
    }));
  }

  async session(user: AuthUser, sessionId: string) {
    const teacherId = this.teacherId(user);
    const row = await this.read.findOne(sessionId);
    if (!row || row.teacherId !== teacherId) throw notFound('Session');
    const ctx = await this.read.context([sessionId]);
    const cfg = await this.settings.get('attendance');
    const feedbackCfg = await this.settings.get('feedback');
    const bookings = await this.prisma.booking.findMany({
      where: { sessionId, activeSlot: true },
      include: {
        client: { include: { level: { select: { name: true } } } },
        attendance: true,
        feedback: true,
      },
      orderBy: { bookedAt: 'asc' },
    });
    const clientIds = bookings.map((b) => b.clientId);
    const prior = clientIds.length
      ? await this.prisma.booking.groupBy({
          by: ['clientId'],
          where: { clientId: { in: clientIds }, status: 'ATTENDED', session: { startsAt: { lt: row.startsAt } } },
          _count: { _all: true },
        })
      : [];
    const priorMap = new Map(prior.map((p) => [p.clientId, p._count._all]));
    const now = this.clock.now().getTime();
    return {
      session: this.read.toDto(row, ctx),
      onlineUrl: row.onlineUrl,
      canMarkAttendance:
        now >= row.startsAt.getTime() - cfg.teacherWindowBeforeMinutes * 60_000 &&
        now <= row.endsAt.getTime() + cfg.teacherWindowAfterMinutes * 60_000,
      feedbackEnabled: feedbackCfg.enabled,
      participants: bookings.map((b) => ({
        bookingId: b.id,
        clientId: b.clientId,
        name: fullName(b.client.firstName, b.client.lastName),
        firstName: b.client.firstName,
        photoUrl: b.client.photoUrl,
        level: b.client.level?.name ?? null,
        category: b.client.category,
        kind: b.kind,
        status: b.status,
        attendance: b.attendance ? { status: b.attendance.status, method: b.attendance.method, markedAt: b.attendance.markedAt } : null,
        visitsBefore: priorMap.get(b.clientId) ?? 0,
        isFirstVisit: (priorMap.get(b.clientId) ?? 0) === 0,
        feedback: b.feedback
          ? {
              participation: b.feedback.participation,
              fluency: b.feedback.fluency,
              vocabulary: b.feedback.vocabulary,
              confidence: b.feedback.confidence,
              pronunciation: b.feedback.pronunciation,
              conversation: b.feedback.conversation,
              comment: b.feedback.comment,
              isVisibleToClient: b.feedback.isVisibleToClient,
            }
          : null,
      })),
    };
  }
}
