import { Injectable, Logger } from '@nestjs/common';
import { AttendanceMethod, AttendanceStatus } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { hasPermission } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { ActorRef, AttendanceMarkedEvent, Events, TrialCompletedEvent } from '../../common/events/events';
import { fullName } from '../../common/utils/names';
import { localClock } from '../../common/utils/time';
import { lockRows, PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { SettingsService } from '../settings/settings.service';
import { AttendanceResultDto, CheckinCodeDto, CheckinResultDto } from './dto/attendance.dto';

interface MarkOutcome {
  result: AttendanceResultDto;
  event: AttendanceMarkedEvent | null;
  trialEvent: TrialCompletedEvent | null;
}

/**
 * Attendance marking. The visit was already deducted at booking time, so
 * attendance only decides ATTENDED vs NO_SHOW — it never touches the ledger
 * (returning a no-show's visit is an explicit, audited admin action).
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
  ) {}

  /** Staff may manage any session; teachers only their own, within the configured window. */
  async assertCanManage(user: AuthUser, session: { teacherId: string | null; startsAt: Date; endsAt: Date }): Promise<'ADMIN' | 'TEACHER'> {
    if (hasPermission(user, 'attendance.manage')) return 'ADMIN';
    if (!hasPermission(user, 'attendance.mark_own') || !user.teacherId || session.teacherId !== user.teacherId) {
      throw new DomainError('ATTENDANCE_NOT_YOUR_SESSION');
    }
    const cfg = await this.settings.get('attendance');
    const now = this.clock.now().getTime();
    const opens = session.startsAt.getTime() - cfg.teacherWindowBeforeMinutes * 60_000;
    const closes = session.endsAt.getTime() + cfg.teacherWindowAfterMinutes * 60_000;
    if (now < opens || now > closes) throw new DomainError('ATTENDANCE_WINDOW_CLOSED');
    return 'TEACHER';
  }

  async mark(bookingId: string, status: AttendanceStatus, user: AuthUser, note?: string): Promise<AttendanceResultDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { session: true } });
    if (!booking) throw notFound('Booking');
    const role = await this.assertCanManage(user, booking.session);
    const outcome = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'bookings', [bookingId]);
      return this.markLocked(tx, bookingId, status, { userId: user.id, source: role }, 'MANUAL', note);
    });
    await this.auditMark(user, outcome);
    await this.publish([outcome]);
    return outcome.result;
  }

  async markBulk(sessionId: string, items: Array<{ bookingId: string; status: AttendanceStatus }>, user: AuthUser): Promise<AttendanceResultDto[]> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw notFound('Session');
    const role = await this.assertCanManage(user, session);
    const outcomes = await this.prisma.transaction(async (tx) => {
      const bookings = await tx.booking.findMany({ where: { id: { in: items.map((i) => i.bookingId) }, sessionId }, select: { id: true } });
      const valid = new Set(bookings.map((b) => b.id));
      await lockRows(tx, 'bookings', [...valid]);
      const results: MarkOutcome[] = [];
      for (const item of items) {
        if (!valid.has(item.bookingId)) continue;
        results.push(await this.markLocked(tx, item.bookingId, item.status, { userId: user.id, source: role }, 'MANUAL'));
      }
      return results;
    });
    for (const o of outcomes) await this.auditMark(user, o);
    await this.publish(outcomes);
    return outcomes.map((o) => o.result);
  }

  /** Marks every still-unmarked participant of a session with one status (e.g. "all present"). */
  async markAll(sessionId: string, status: AttendanceStatus, user: AuthUser): Promise<AttendanceResultDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { sessionId, status: 'BOOKED' },
      select: { id: true },
    });
    if (!bookings.length) return [];
    return this.markBulk(sessionId, bookings.map((b) => ({ bookingId: b.id, status })), user);
  }

  private async markLocked(
    tx: Tx,
    bookingId: string,
    status: AttendanceStatus,
    actor: ActorRef,
    method: AttendanceMethod,
    note?: string,
  ): Promise<MarkOutcome> {
    const now = this.clock.now();
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        attendance: true,
        session: { include: { location: { select: { timezone: true } } } },
        client: { select: { firstName: true, lastName: true, lastVisitAt: true } },
      },
    });
    if (!booking) throw notFound('Booking');
    if (booking.status === 'CANCELLED' || booking.status === 'LATE_CANCELLED') throw new DomainError('ATTENDANCE_BOOKING_CANCELLED');
    const previous = booking.attendance?.status ?? null;
    const clientName = fullName(booking.client.firstName, booking.client.lastName);
    const result: AttendanceResultDto = { bookingId, status, previousStatus: previous, clientName };
    if (previous === status && booking.status !== 'BOOKED') return { result, event: null, trialEvent: null };

    const attended = status !== 'ABSENT';
    await tx.attendance.upsert({
      where: { bookingId },
      create: { bookingId, sessionId: booking.sessionId, clientId: booking.clientId, status, method, markedById: actor.userId, markedAt: now, note: note ?? null },
      update: { status, method, markedById: actor.userId, markedAt: now, note: note ?? undefined },
    });
    await tx.booking.update({ where: { id: bookingId }, data: { status: attended ? 'ATTENDED' : 'NO_SHOW' } });

    // Keep "last visit" accurate for segments (inactive clients, VIP, …).
    if (attended) {
      if (!booking.client.lastVisitAt || booking.client.lastVisitAt < booking.session.startsAt) {
        await tx.client.update({ where: { id: booking.clientId }, data: { lastVisitAt: booking.session.startsAt } });
      }
    } else if (previous && previous !== 'ABSENT') {
      const latest = await tx.booking.findFirst({
        where: { clientId: booking.clientId, status: 'ATTENDED' },
        orderBy: { session: { startsAt: 'desc' } },
        select: { session: { select: { startsAt: true } } },
      });
      await tx.client.update({ where: { id: booking.clientId }, data: { lastVisitAt: latest?.session.startsAt ?? null } });
    }

    let trialEvent: TrialCompletedEvent | null = null;
    if (booking.kind === 'TRIAL') {
      const trial = await tx.trial.findUnique({ where: { bookingId } });
      if (trial) {
        await tx.trial.update({
          where: { id: trial.id },
          data: { status: attended ? 'ATTENDED' : 'NO_SHOW', attendedAt: attended ? booking.session.startsAt : null },
        });
        if (!previous || (previous === 'ABSENT') !== !attended) {
          trialEvent = { trialId: trial.id, clientId: booking.clientId, attended };
        }
      }
    }

    await tx.clientActivity.create({
      data: {
        clientId: booking.clientId,
        type: attended ? 'attendance.present' : 'attendance.no_show',
        title: `${status === 'PRESENT' ? 'Attended' : status === 'LATE' ? 'Attended (late)' : 'No-show'} — ${localClock(booking.session.startsAt, booking.session.location.timezone)}${previous ? ` (was ${previous.toLowerCase()})` : ''}`,
        data: { bookingId, sessionId: booking.sessionId, method },
        actorId: actor.userId,
      },
    });

    return {
      result,
      event: {
        bookingId,
        sessionId: booking.sessionId,
        clientId: booking.clientId,
        status,
        previousStatus: previous,
        kind: booking.kind,
        actor,
      },
      trialEvent,
    };
  }

  private async auditMark(user: AuthUser, outcome: MarkOutcome): Promise<void> {
    if (!outcome.event) return;
    await this.audit.log({
      actor: user,
      action: outcome.result.previousStatus ? 'attendance.correct' : 'attendance.mark',
      entityType: 'Booking',
      entityId: outcome.result.bookingId,
      oldValue: outcome.result.previousStatus ? { status: outcome.result.previousStatus } : null,
      newValue: { client: outcome.result.clientName, status: outcome.result.status },
    });
  }

  private async publish(outcomes: MarkOutcome[]): Promise<void> {
    for (const o of outcomes) {
      if (o.event) await this.events.publish<AttendanceMarkedEvent>(Events.AttendanceMarked, o.event);
      if (o.trialEvent) await this.events.publish<TrialCompletedEvent>(Events.TrialCompleted, o.trialEvent);
    }
  }

  // ─── QR check-in ───

  async checkinCode(clientId: string): Promise<CheckinCodeDto> {
    const cfg = await this.settings.get('attendance');
    if (!cfg.qrCheckinEnabled) throw new DomainError('CHECKIN_DISABLED');
    const ttl = 5 * 60;
    return {
      token: this.tokens.signCheckin(clientId, ttl),
      expiresAt: new Date(this.clock.now().getTime() + ttl * 1000),
      refreshInSeconds: ttl - 30,
    };
  }

  async checkin(token: string, sessionId: string | undefined, user: AuthUser): Promise<CheckinResultDto> {
    const cfg = await this.settings.get('attendance');
    if (!cfg.qrCheckinEnabled) throw new DomainError('CHECKIN_DISABLED');
    const clientId = this.tokens.verifyCheckin(token);
    if (!clientId) throw new DomainError('CHECKIN_TOKEN_INVALID');
    const now = this.clock.now();
    const booking = await this.prisma.booking.findFirst({
      where: {
        clientId,
        activeSlot: true,
        sessionId,
        session: {
          status: 'SCHEDULED',
          startsAt: { lte: new Date(now.getTime() + cfg.teacherWindowBeforeMinutes * 60_000) },
          endsAt: { gte: now },
        },
      },
      include: { session: { include: { groupType: true, location: true } } },
      orderBy: { session: { startsAt: 'asc' } },
    });
    if (!booking) throw new DomainError('CHECKIN_NO_BOOKING');
    const role = await this.assertCanManage(user, booking.session);
    // Arriving more than 10 minutes after the start counts as late.
    const status: AttendanceStatus = now.getTime() > booking.session.startsAt.getTime() + 10 * 60_000 ? 'LATE' : 'PRESENT';
    const outcome = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'bookings', [booking.id]);
      return this.markLocked(tx, booking.id, status, { userId: user.id, source: role }, 'QR');
    });
    await this.auditMark(user, outcome);
    await this.publish([outcome]);
    return {
      ...outcome.result,
      sessionId: booking.sessionId,
      sessionTitle: booking.session.title ?? booking.session.groupType?.name ?? 'Speaking Club',
      startTime: localClock(booking.session.startsAt, booking.session.location.timezone),
    };
  }

  // ─── Automatic finalisation ───

  /**
   * Background job: N minutes after a session ends, bookings nobody marked are
   * finalised with the configured outcome (default NO_SHOW — the visit stays used).
   */
  async finalizeDue(): Promise<number> {
    const cfg = await this.settings.get('attendance');
    const now = this.clock.now();
    const sessions = await this.prisma.session.findMany({
      where: {
        status: 'SCHEDULED',
        attendanceFinalizedAt: null,
        endsAt: { lte: new Date(now.getTime() - cfg.autoFinalizeAfterMinutes * 60_000) },
      },
      select: { id: true },
      take: 200,
    });
    let finalized = 0;
    for (const session of sessions) {
      try {
        const outcomes = await this.prisma.transaction(async (tx) => {
          await lockRows(tx, 'sessions', [session.id]);
          const pending = await tx.booking.findMany({ where: { sessionId: session.id, status: 'BOOKED' }, select: { id: true } });
          await lockRows(tx, 'bookings', pending.map((b) => b.id));
          const results: MarkOutcome[] = [];
          for (const b of pending) {
            results.push(
              await this.markLocked(tx, b.id, cfg.unmarkedOutcome === 'NO_SHOW' ? 'ABSENT' : 'PRESENT', { userId: null, source: 'SYSTEM' }, 'AUTO'),
            );
          }
          await tx.session.update({ where: { id: session.id }, data: { attendanceFinalizedAt: now } });
          return results;
        });
        finalized += outcomes.length;
        await this.publish(outcomes);
      } catch (error) {
        this.logger.error(`Finalising attendance for session ${session.id} failed: ${(error as Error).message}`);
      }
    }
    if (finalized) this.logger.log(`Auto-finalised ${finalized} booking(s)`);
    return finalized;
  }
}
