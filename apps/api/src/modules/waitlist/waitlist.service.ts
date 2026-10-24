import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { Events, SeatReleasedEvent, WaitlistOfferedEvent } from '../../common/events/events';
import { lockRows, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { BookingConfirmationDto, MyWaitlistRefDto } from '../bookings/dto/booking.dto';
import { SettingsService } from '../settings/settings.service';

/**
 * Waitlist for full sessions.
 *
 * When a seat frees up, the first eligible person is offered it and the seat is
 * held for `offerMinutes` (configurable). If they don't claim it, the offer
 * expires and passes to the next person. Close to the start (less than
 * `stopOffersMinutesBeforeStart`) holds make no sense, so everyone waiting is
 * notified at once and the first to book gets the seat.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
  ) {}

  async join(sessionId: string, clientId: string): Promise<MyWaitlistRefDto> {
    const config = await this.settings.get('waitlist');
    if (!config.enabled) throw new DomainError('WAITLIST_DISABLED');
    const entry = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'clients', [clientId]);
      await lockRows(tx, 'sessions', [sessionId]);
      const existing = await tx.waitlistEntry.findFirst({ where: { sessionId, clientId, activeSlot: true } });
      if (existing) throw new DomainError('WAITLIST_ALREADY_JOINED');
      // Would the client be able to book if a seat were free?
      const withSeat = await this.bookings.evaluateLocked(tx, {
        sessionId,
        clientId,
        kind: 'MEMBERSHIP',
        source: 'WAITLIST',
        overrides: { capacity: true },
      });
      if (!withSeat.result.ok) throw new DomainError(withSeat.result.code, { details: withSeat.result.details });
      const now = await this.bookings.evaluateLocked(tx, { sessionId, clientId, kind: 'MEMBERSHIP', source: 'WAITLIST' });
      if (now.result.ok) throw new DomainError('WAITLIST_SESSION_NOT_FULL');
      return tx.waitlistEntry.create({ data: { sessionId, clientId, status: 'WAITING', activeSlot: true } });
    });
    await this.prisma.clientActivity.create({
      data: { clientId, type: 'waitlist.joined', title: 'Joined the waitlist', data: { sessionId } },
    });
    return this.ref(entry.id);
  }

  async leave(sessionId: string, clientId: string): Promise<void> {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { sessionId, clientId, activeSlot: true } });
    if (!entry) throw notFound('Waitlist entry');
    await this.prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'CANCELLED', activeSlot: null } });
    if (entry.status === 'OFFERED') await this.offerNext(sessionId);
  }

  /** Books the seat reserved for this client. */
  async claim(entryId: string, clientId: string, user: AuthUser): Promise<BookingConfirmationDto> {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { id: entryId, clientId } });
    if (!entry) throw notFound('Waitlist entry');
    if (entry.status === 'EXPIRED' || (entry.status === 'OFFERED' && entry.offerExpiresAt && entry.offerExpiresAt <= this.clock.now())) {
      throw new DomainError('WAITLIST_OFFER_EXPIRED');
    }
    if (entry.status !== 'OFFERED' && entry.status !== 'WAITING') throw new DomainError('WAITLIST_NO_OFFER');
    return this.bookings.book({
      sessionId: entry.sessionId,
      clientId,
      kind: 'MEMBERSHIP',
      source: 'WAITLIST',
      actor: { userId: user.id, source: 'CLIENT' },
    });
  }

  async removeByAdmin(entryId: string, actor: AuthUser): Promise<void> {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry || !entry.activeSlot) throw notFound('Waitlist entry');
    await this.prisma.waitlistEntry.update({ where: { id: entryId }, data: { status: 'REMOVED', activeSlot: null } });
    await this.audit.log({ actor, action: 'waitlist.remove', entityType: 'WaitlistEntry', entityId: entryId, oldValue: { status: entry.status } });
    if (entry.status === 'OFFERED') await this.offerNext(entry.sessionId);
  }

  async ref(entryId: string): Promise<MyWaitlistRefDto> {
    const entry = await this.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } });
    const ahead = await this.prisma.waitlistEntry.count({
      where: { sessionId: entry.sessionId, activeSlot: true, createdAt: { lt: entry.createdAt } },
    });
    return { id: entry.id, status: entry.status, position: ahead + 1, offerExpiresAt: entry.offerExpiresAt };
  }

  @OnEvent(Events.SeatReleased)
  async onSeatReleased(event: SeatReleasedEvent): Promise<void> {
    try {
      await this.offerNext(event.sessionId);
    } catch (error) {
      this.logger.error(`Waitlist offer failed for session ${event.sessionId}: ${(error as Error).message}`);
    }
  }

  /** Offers free seats to the next eligible people on the waitlist. Returns the entries notified. */
  async offerNext(sessionId: string): Promise<string[]> {
    const config = await this.settings.get('waitlist');
    if (!config.enabled) return [];
    const offers: WaitlistOfferedEvent[] = [];
    await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'sessions', [sessionId]);
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      const now = this.clock.now();
      if (!session || session.status !== 'SCHEDULED' || session.startsAt <= now || session.bookingClosed) return;
      const [booked, held] = await Promise.all([
        tx.booking.count({ where: { sessionId, activeSlot: true } }),
        tx.waitlistEntry.count({ where: { sessionId, status: 'OFFERED', offerExpiresAt: { gt: now } } }),
      ]);
      let free = session.capacity - booked - held;
      if (free <= 0) return;

      const minutesToStart = (session.startsAt.getTime() - now.getTime()) / 60_000;
      const lastMinute = minutesToStart <= config.stopOffersMinutesBeforeStart;
      const waiting = await tx.waitlistEntry.findMany({
        where: { sessionId, status: 'WAITING', activeSlot: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const entry of waiting) {
        if (!lastMinute && free <= 0) break;
        const check = await this.bookings.evaluateLocked(tx, {
          sessionId,
          clientId: entry.clientId,
          kind: 'MEMBERSHIP',
          source: 'WAITLIST',
          overrides: { capacity: true },
        });
        if (!check.result.ok) continue;
        if (lastMinute) {
          // Notify everyone; the seat is not held.
          if (!entry.offeredAt) {
            await tx.waitlistEntry.update({ where: { id: entry.id }, data: { offeredAt: now } });
            offers.push({ entryId: entry.id, sessionId, clientId: entry.clientId, expiresAt: session.startsAt });
          }
          continue;
        }
        const expiresAt = new Date(
          Math.min(now.getTime() + config.offerMinutes * 60_000, session.startsAt.getTime() - config.stopOffersMinutesBeforeStart * 60_000),
        );
        await tx.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'OFFERED', offeredAt: now, offerExpiresAt: expiresAt },
        });
        offers.push({ entryId: entry.id, sessionId, clientId: entry.clientId, expiresAt });
        free -= 1;
      }
    });
    for (const offer of offers) {
      await this.events.publish<WaitlistOfferedEvent>(Events.WaitlistOffered, offer);
    }
    return offers.map((o) => o.entryId);
  }

  /** Background job: expire unclaimed offers and pass the seat on. */
  async expireOffers(): Promise<number> {
    const now = this.clock.now();
    const expired = await this.prisma.waitlistEntry.findMany({
      where: { status: 'OFFERED', offerExpiresAt: { lte: now } },
      select: { id: true, sessionId: true },
    });
    if (!expired.length) return 0;
    await this.prisma.waitlistEntry.updateMany({
      where: { id: { in: expired.map((e) => e.id) }, status: 'OFFERED' },
      data: { status: 'EXPIRED', activeSlot: null },
    });
    for (const sessionId of new Set(expired.map((e) => e.sessionId))) {
      await this.offerNext(sessionId);
    }
    return expired.length;
  }
}
