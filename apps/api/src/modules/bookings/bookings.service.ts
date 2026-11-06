import { Inject, Injectable } from '@nestjs/common';
import { Booking, BookingKind, BookingSource, MembershipTxType, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { hasPermission } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { ERROR_CATALOG, ErrorCode } from '../../common/errors/error-codes';
import { EventBus } from '../../common/events/event-bus.service';
import {
  ActorRef,
  BookingCancelledEvent,
  BookingCreatedEvent,
  Events,
  SeatReleasedEvent,
  SessionCancelledEvent,
  SessionFullEvent,
  TrialScheduledEvent,
} from '../../common/events/events';
import { localizeError } from '../../common/i18n/error-messages';
import { requestLocale } from '../../common/request-context';
import { fullName } from '../../common/utils/names';
import { formatSessionTime } from '../../common/utils/time';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { BookingOverrides, evaluateBooking } from '../../domain/booking-policy';
import { assessCancellation } from '../../domain/cancellation-policy';
import { levelPositions, levelRangeLabel } from '../../domain/level-policy';
import { MembershipCandidate } from '../../domain/membership-rules';
import { visibleOnlineUrl } from '../../domain/online-link';
import { lockRows, PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MembershipLedgerService } from '../memberships/membership-ledger.service';
import { MembershipsService } from '../memberships/memberships.service';
import { PaymentsService } from '../payments/payments.service';
import { SessionListQueryDto } from '../sessions/dto/session.dto';
import { SessionReadService, SessionRow, SessionViewContext } from '../sessions/session-read.service';
import { SettingsService } from '../settings/settings.service';
import { BOOKING_TEXTS } from './booking-texts';
import { bookingInclude, BookingRow, toBookingDto } from './booking.mapper';
import {
  AddParticipantDto,
  AdminBookingPageDto,
  AdminBookingsQueryDto,
  AdminCancelBookingDto,
  AdminSessionDetailDto,
  BookabilityDto,
  BookingConfirmationDto,
  BookingDto,
  CancelBookingDto,
  CancellationPreviewDto,
  CancellationResultDto,
  CancelSessionDto,
  ClientSessionDto,
  MoveBookingDto,
  MyAttendanceDto,
  MyBookingsDto,
  MyBookingsQueryDto,
  ParticipantClientDto,
  ParticipantDto,
  SessionCancellationResultDto,
  WaitlistItemDto,
} from './dto/booking.dto';
import { buildIcs } from './ics';

export interface BookInput {
  sessionId: string;
  clientId: string;
  kind: BookingKind;
  source: BookingSource;
  actor: ActorRef;
  membershipId?: string;
  overrides?: BookingOverrides;
  notes?: string;
  /** Existing trial request being scheduled */
  trialId?: string;
  movedFromBookingId?: string;
}

interface CreatedBooking {
  booking: Booking;
  membershipName: string | null;
  visitsRemaining: number | null;
  levelWarning: 'TOO_LOW' | 'TOO_HIGH' | null;
  trialId: string | null;
  trialPaymentId: string | null;
  trialPrice: number | null;
  sessionFull: boolean;
}

interface CancelOptions {
  actor: ActorRef;
  source: 'CLIENT' | 'ADMIN' | 'SYSTEM';
  clientScopeId?: string;
  acknowledgeLate?: boolean;
  waivePenalty?: boolean;
  reason?: string | null;
  refundType?: MembershipTxType;
  /** What happens to a trial behind the booking: cancel it (default), keep it for a move, or reopen it for rescheduling */
  trialMode?: 'CANCEL' | 'MOVE' | 'RESCHEDULE';
}

interface CancelOutcome {
  booking: Booking;
  isLate: boolean;
  visitReturned: boolean;
  sessionStarted: boolean;
}

interface ViewerContext {
  clientId: string;
  category: string;
  levelId: string | null;
  levelName: string | null;
  memberships: Array<MembershipCandidate & { planName: string }>;
  membershipsEver: number;
  trialsUsed: number;
  /** Active bookings by session id */
  bookings: Map<string, { id: string; status: Booking['status']; kind: BookingKind }>;
  upcoming: Array<{ sessionId: string; startsAt: Date; endsAt: Date }>;
  waitlist: Map<string, { id: string; status: 'WAITING' | 'OFFERED'; createdAt: Date; offerExpiresAt: Date | null }>;
}

function toCandidate(m: {
  id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  programId: string;
  startsAt: Date;
  expiresAt: Date;
  visitsRemaining: number;
  planName: string;
  plan: { formats: string[]; groupTypes: Array<{ groupTypeId: string }> };
}): MembershipCandidate & { planName: string } {
  return {
    id: m.id,
    status: m.status,
    programId: m.programId,
    startsAt: m.startsAt,
    expiresAt: m.expiresAt,
    visitsRemaining: m.visitsRemaining,
    planFormats: m.plan.formats,
    planGroupTypeIds: m.plan.groupTypes.map((g) => g.groupTypeId),
    planName: m.planName,
  };
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: SessionReadService,
    private readonly memberships: MembershipsService,
    private readonly ledger: MembershipLedgerService,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ═════════════════════════ Schedule for a viewer ═════════════════════════

  async scheduleForViewer(query: SessionListQueryDto, clientId: string | null): Promise<ClientSessionDto[]> {
    const booking = await this.settings.get('booking');
    const where = await this.read.buildWhere(
      { ...query, includeCancelled: false },
      { defaultDays: booking.openDaysAhead > 0 ? booking.openDaysAhead : 21 },
    );
    const rows = await this.read.findMany({
      ...where,
      program: { isActive: true, isVisibleToClients: true },
    });
    const viewer = clientId ? await this.loadViewer(clientId) : null;
    const ctx = await this.read.context(rows.map((r) => r.id));
    const dtos = await Promise.all(rows.map((row) => this.toClientSession(row, ctx, viewer)));
    const levelRank = viewer?.levelId
      ? ((await this.prisma.level.findUnique({ where: { id: viewer.levelId }, select: { rank: true } }))?.rank ?? null)
      : null;
    return (await this.read.applyMemoryFilters(dtos, query, levelRank)) as ClientSessionDto[];
  }

  async sessionForViewer(sessionId: string, clientId: string | null): Promise<ClientSessionDto> {
    const row = await this.read.findOne(sessionId);
    if (!row || !row.programId) throw notFound('Session');
    const viewer = clientId ? await this.loadViewer(clientId) : null;
    const ctx = await this.read.context([row.id]);
    return this.toClientSession(row, ctx, viewer);
  }

  private async loadViewer(clientId: string): Promise<ViewerContext | null> {
    const now = this.clock.now();
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { level: true } });
    if (!client) return null;
    const [memberships, membershipsEver, trialsUsed, bookings, waitlist] = await Promise.all([
      this.memberships.activeForClient(this.prisma, clientId),
      this.prisma.membership.count({ where: { clientId } }),
      this.prisma.booking.count({ where: { clientId, kind: 'TRIAL', activeSlot: true } }),
      this.prisma.booking.findMany({
        where: { clientId, activeSlot: true, session: { endsAt: { gt: new Date(now.getTime() - 86_400_000) } } },
        select: { id: true, status: true, kind: true, sessionId: true, session: { select: { startsAt: true, endsAt: true, status: true } } },
      }),
      this.prisma.waitlistEntry.findMany({
        where: { clientId, activeSlot: true },
        select: { id: true, status: true, sessionId: true, createdAt: true, offerExpiresAt: true },
      }),
    ]);
    return {
      clientId,
      category: client.category,
      levelId: client.levelId,
      levelName: client.level?.name ?? null,
      memberships: memberships.map(toCandidate),
      membershipsEver,
      trialsUsed,
      bookings: new Map(bookings.map((b) => [b.sessionId, { id: b.id, status: b.status, kind: b.kind }])),
      upcoming: bookings
        .filter((b) => b.status === 'BOOKED' && b.session.status === 'SCHEDULED' && b.session.endsAt > now)
        .map((b) => ({ sessionId: b.sessionId, startsAt: b.session.startsAt, endsAt: b.session.endsAt })),
      waitlist: new Map(
        waitlist.map((w) => [
          w.sessionId,
          { id: w.id, status: w.status as 'WAITING' | 'OFFERED', createdAt: w.createdAt, offerExpiresAt: w.offerExpiresAt },
        ]),
      ),
    };
  }

  private levelCache = new Map<string, { at: number; positions: Map<string, number> }>();

  private async positionsFor(programId: string): Promise<Map<string, number>> {
    const cached = this.levelCache.get(programId);
    if (cached && Date.now() - cached.at < 60_000) return cached.positions;
    const levels = await this.prisma.level.findMany({ where: { programId }, select: { id: true, rank: true } });
    const positions = levelPositions(levels);
    this.levelCache.set(programId, { at: Date.now(), positions });
    return positions;
  }

  private async toClientSession(row: SessionRow, ctx: SessionViewContext, viewer: ViewerContext | null): Promise<ClientSessionDto> {
    const dto = this.read.toDto(row, ctx);
    const myBooking = viewer?.bookings.get(row.id) ?? null;
    const waiting = viewer?.waitlist.get(row.id) ?? null;
    let position = 0;
    if (waiting) {
      position =
        (await this.prisma.waitlistEntry.count({
          where: { sessionId: row.id, activeSlot: true, createdAt: { lt: waiting.createdAt } },
        })) + 1;
    }
    return {
      ...dto,
      bookability: viewer ? await this.bookability(row, dto.booked, dto.held, ctx.now, viewer) : null,
      myBooking: myBooking ? { id: myBooking.id, status: myBooking.status, kind: myBooking.kind } : null,
      myWaitlist: waiting ? { id: waiting.id, status: waiting.status, position, offerExpiresAt: waiting.offerExpiresAt } : null,
      ...(myBooking ? visibleOnlineUrl(row, ctx.now) : { onlineUrl: null, onlineUrlOpensAt: null }),
    };
  }

  private async bookability(row: SessionRow, booked: number, held: number, now: Date, viewer: ViewerContext): Promise<BookabilityDto> {
    const [bookingSettings, trial, waitlist] = await Promise.all([
      this.settings.get('booking'),
      this.settings.get('trial'),
      this.settings.get('waitlist'),
    ]);
    const positions = await this.positionsFor(row.programId);
    const base = {
      now,
      session: {
        id: row.id,
        programId: row.programId,
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        capacity: row.capacity,
        bookingClosed: row.bookingClosed,
        trialsAllowed: row.trialsAllowed,
        format: row.format,
        groupTypeId: row.groupTypeId,
        allowedCategories: row.groupType?.clientCategories ?? [],
        levelMinPosition: row.levelMinId ? (positions.get(row.levelMinId) ?? null) : null,
        levelMaxPosition: row.levelMaxId ? (positions.get(row.levelMaxId) ?? null) : null,
      },
      booked,
      held,
      holdsOffer: viewer.waitlist.get(row.id)?.status === 'OFFERED' && (viewer.waitlist.get(row.id)?.offerExpiresAt ?? now) > now,
      client: { category: viewer.category, levelPosition: viewer.levelId ? (positions.get(viewer.levelId) ?? null) : null },
      alreadyBooked: viewer.bookings.has(row.id),
      otherBookings: viewer.upcoming.filter((b) => b.sessionId !== row.id),
      memberships: viewer.memberships,
      trialEligible: trial.allowSelfBooking && viewer.membershipsEver === 0 && viewer.trialsUsed < trial.maxPerClient,
      settings: {
        cutoffMinutesBeforeStart: bookingSettings.cutoffMinutesBeforeStart,
        openDaysAhead: bookingSettings.openDaysAhead,
        levelEnforcement: bookingSettings.levelEnforcement,
        levelTolerance: bookingSettings.levelTolerance,
        allowOverlappingBookings: bookingSettings.allowOverlappingBookings,
        trialsEnabled: trial.enabled,
      },
    } as const;

    const result = evaluateBooking({ ...base, kind: 'MEMBERSHIP' });
    const trialResult = base.trialEligible && trial.enabled ? evaluateBooking({ ...base, kind: 'TRIAL' }) : null;
    let canJoinWaitlist = false;
    if (!result.ok && (result.code === 'BOOKING_SESSION_FULL' || result.code === 'BOOKING_OFFER_RESERVED')) {
      const withSeat = evaluateBooking({ ...base, kind: 'MEMBERSHIP', overrides: { capacity: true } });
      canJoinWaitlist = waitlist.enabled && withSeat.ok && !viewer.waitlist.has(row.id);
    }
    const policy = await this.settings.get('cancellation');
    const deadline = assessCancellation({
      sessionStartsAt: row.startsAt,
      bookedAt: now,
      now,
      policy,
      tz: row.location.timezone,
      visitDeducted: true,
    });
    const locale = requestLocale();
    const levelWarning = result.levelWarning
      ? BOOKING_TEXTS[locale].levelMismatch(levelRangeLabel(row.levelMin, row.levelMax, locale), viewer.levelName)
      : null;
    const chosen = result.ok ? result.membership : null;
    return {
      canBook: result.ok,
      reason: result.ok ? null : result.code,
      message: result.ok ? null : localizeError(ERROR_CATALOG[result.code as ErrorCode].message, locale),
      levelWarning,
      membershipId: chosen?.id ?? null,
      membershipName: chosen ? (viewer.memberships.find((m) => m.id === chosen.id)?.planName ?? null) : null,
      visitsRemainingAfter: chosen ? chosen.visitsRemaining - 1 : null,
      canJoinWaitlist,
      canBookTrial: !!trialResult?.ok,
      trialPrice: trialResult?.ok ? trial.price : null,
      freeCancellationAvailable: !deadline.isLate,
    };
  }

  // ═════════════════════════ Booking ═════════════════════════

  async book(input: BookInput): Promise<BookingConfirmationDto> {
    const created = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'clients', [input.clientId]);
      await lockRows(tx, 'sessions', [input.sessionId]);
      return this.createBookingLocked(tx, input);
    });
    await this.afterBooked(created, input);
    return this.confirmation(created);
  }

  async addParticipant(sessionId: string, dto: AddParticipantDto, actor: AuthUser): Promise<BookingConfirmationDto> {
    const wantsOverride = dto.overrideCapacity || dto.overrideRules;
    if (wantsOverride && !hasPermission(actor, 'bookings.override')) {
      throw new DomainError('FORBIDDEN', { message: 'You need the "override" permission for this.' });
    }
    const kind = dto.kind ?? 'MEMBERSHIP';
    if (kind === 'COMPLIMENTARY' && !hasPermission(actor, 'bookings.override')) {
      throw new DomainError('FORBIDDEN', { message: 'Complimentary bookings require the "override" permission.' });
    }
    const result = await this.book({
      sessionId,
      clientId: dto.clientId,
      kind,
      source: 'ADMIN',
      actor: { userId: actor.id, source: 'ADMIN' },
      membershipId: dto.membershipId,
      notes: dto.notes,
      overrides: {
        capacity: dto.overrideCapacity,
        window: dto.overrideRules,
        level: dto.overrideRules,
        category: dto.overrideRules,
        overlap: dto.overrideRules,
        trialLimit: dto.overrideRules,
      },
    });
    await this.audit.log({
      actor,
      action: 'booking.create_for_client',
      entityType: 'Booking',
      entityId: result.booking.id,
      newValue: { sessionId, clientId: dto.clientId, kind, overrideCapacity: !!dto.overrideCapacity, overrideRules: !!dto.overrideRules },
    });
    return result;
  }

  /**
   * Loads everything the booking rules need (under the caller's locks) and runs
   * the booking policy. Used by booking, waitlist eligibility and offers.
   */
  async evaluateLocked(tx: Tx, input: Pick<BookInput, 'sessionId' | 'clientId' | 'kind' | 'source' | 'membershipId' | 'overrides'>) {
    const now = this.clock.now();
    const [bookingSettings, trialSettings] = await Promise.all([this.settings.get('booking'), this.settings.get('trial')]);
    const session = await tx.session.findUnique({
      where: { id: input.sessionId },
      include: { groupType: true, location: true, teacher: { select: { firstName: true, lastName: true } } },
    });
    if (!session) throw notFound('Session');
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client || client.status !== 'ACTIVE') throw notFound('Client');

    const [booked, offers, alreadyBooked, otherBookings, levels] = await Promise.all([
      tx.booking.count({ where: { sessionId: session.id, activeSlot: true } }),
      tx.waitlistEntry.findMany({
        where: { sessionId: session.id, status: 'OFFERED', offerExpiresAt: { gt: now } },
        select: { clientId: true },
      }),
      tx.booking.findFirst({ where: { sessionId: session.id, clientId: client.id, activeSlot: true }, select: { id: true } }),
      tx.booking.findMany({
        where: {
          clientId: client.id,
          status: 'BOOKED',
          sessionId: { not: session.id },
          session: { status: 'SCHEDULED', endsAt: { gt: now } },
        },
        select: { session: { select: { startsAt: true, endsAt: true } } },
      }),
      tx.level.findMany({ where: { programId: session.programId }, select: { id: true, rank: true } }),
    ]);
    const positions = levelPositions(levels);

    let membershipRows: Awaited<ReturnType<MembershipsService['activeForClient']>> = [];
    if (input.kind === 'MEMBERSHIP') {
      membershipRows = await this.memberships.activeForClient(tx, client.id);
      if (input.membershipId) membershipRows = membershipRows.filter((m) => m.id === input.membershipId);
    }
    let trialEligible = false;
    if (input.kind === 'TRIAL') {
      const [ever, trials] = await Promise.all([
        tx.membership.count({ where: { clientId: client.id } }),
        tx.booking.count({ where: { clientId: client.id, kind: 'TRIAL', activeSlot: true } }),
      ]);
      trialEligible = ever === 0 && trials < trialSettings.maxPerClient && (input.source !== 'CLIENT' || trialSettings.allowSelfBooking);
    }

    const result = evaluateBooking({
      now,
      kind: input.kind,
      session: {
        id: session.id,
        programId: session.programId,
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        capacity: session.capacity,
        bookingClosed: session.bookingClosed,
        trialsAllowed: session.trialsAllowed,
        format: session.format,
        groupTypeId: session.groupTypeId,
        allowedCategories: session.groupType?.clientCategories ?? [],
        levelMinPosition: session.levelMinId ? (positions.get(session.levelMinId) ?? null) : null,
        levelMaxPosition: session.levelMaxId ? (positions.get(session.levelMaxId) ?? null) : null,
      },
      booked,
      held: offers.length,
      holdsOffer: offers.some((o) => o.clientId === client.id),
      client: { category: client.category, levelPosition: client.levelId ? (positions.get(client.levelId) ?? null) : null },
      alreadyBooked: !!alreadyBooked,
      otherBookings: otherBookings.map((b) => b.session),
      memberships: membershipRows.map(toCandidate),
      trialEligible,
      settings: {
        cutoffMinutesBeforeStart: bookingSettings.cutoffMinutesBeforeStart,
        openDaysAhead: bookingSettings.openDaysAhead,
        levelEnforcement: bookingSettings.levelEnforcement,
        levelTolerance: bookingSettings.levelTolerance,
        allowOverlappingBookings: bookingSettings.allowOverlappingBookings,
        trialsEnabled: trialSettings.enabled,
      },
      overrides: input.overrides,
    });
    return { now, result, session, client, booked, membershipRows, trialSettings };
  }

  /** Core booking step. Caller must hold row locks on the client and the session. */
  private async createBookingLocked(tx: Tx, input: BookInput): Promise<CreatedBooking> {
    const { now, result, session, client, booked, membershipRows, trialSettings } = await this.evaluateLocked(tx, input);
    if (!result.ok) throw new DomainError(result.code, { details: result.details });

    const title = session.title ?? session.groupType?.name ?? 'Speaking Club';
    const teacher = session.teacher ? fullName(session.teacher.firstName, session.teacher.lastName) : null;
    const label = `${title}${teacher ? ` with ${teacher}` : ''}, ${formatSessionTime(session.startsAt, session.location.timezone)}`;

    const booking = await tx.booking.create({
      data: {
        sessionId: session.id,
        clientId: client.id,
        membershipId: result.membership?.id ?? null,
        kind: input.kind,
        status: 'BOOKED',
        activeSlot: true,
        source: input.source,
        bookedById: input.actor.userId,
        bookedAt: now,
        visitDeducted: input.kind === 'MEMBERSHIP',
        capacityOverride: result.capacityOverride,
        notes: input.notes ?? null,
      },
    });

    let visitsRemaining: number | null = null;
    let membershipName: string | null = null;
    if (result.membership) {
      const entry = await this.ledger.post(tx, {
        membershipId: result.membership.id,
        type: 'BOOKING',
        delta: -1,
        bookingId: booking.id,
        reason: label,
        createdById: input.actor.userId,
        insufficientError: 'BOOKING_NO_VISITS_LEFT',
      });
      visitsRemaining = entry.balanceAfter;
      membershipName = membershipRows.find((m) => m.id === result.membership!.id)?.planName ?? null;
    }

    let trialId: string | null = null;
    let trialPaymentId: string | null = null;
    let trialPrice: number | null = null;
    if (input.kind === 'TRIAL') {
      const lead = await tx.lead.findUnique({ where: { clientId: client.id }, select: { id: true } });
      const existing = input.trialId ? await tx.trial.findUnique({ where: { id: input.trialId } }) : null;
      const trial = existing
        ? await tx.trial.update({
            where: { id: existing.id },
            data: { status: 'SCHEDULED', sessionId: session.id, bookingId: booking.id, clientId: client.id, leadId: existing.leadId ?? lead?.id },
          })
        : await tx.trial.create({
            data: {
              clientId: client.id,
              leadId: lead?.id ?? null,
              name: fullName(client.firstName, client.lastName),
              phone: client.phone ?? '',
              levelId: client.levelId,
              preferredDays: client.preferredDays,
              preferredTimes: client.preferredTimes,
              status: 'SCHEDULED',
              sessionId: session.id,
              bookingId: booking.id,
              price: trialSettings.price,
              source: input.source === 'CLIENT' ? 'app' : 'admin',
              createdById: input.actor.userId,
            },
          });
      trialId = trial.id;
      trialPrice = trial.price;
      const payment = await tx.payment.findUnique({ where: { trialId: trial.id } });
      if (payment) {
        trialPaymentId = payment.id;
        // A trial rescheduled after cancellation reopens its payment request.
        if (payment.status === 'CANCELLED' || payment.status === 'FAILED') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'PENDING', cancelledAt: null, failureReason: null } });
        }
      } else if (trial.price > 0) {
        trialPaymentId = (
          await this.payments.createPendingTx(tx, {
            clientId: client.id,
            amount: trial.price,
            productType: 'TRIAL',
            trialId: trial.id,
            description: `Trial session — ${label}`,
            createdById: input.actor.userId,
          })
        ).id;
      }
    }

    // A waitlist entry for this session is fulfilled by the booking.
    await tx.waitlistEntry.updateMany({
      where: { sessionId: session.id, clientId: client.id, activeSlot: true },
      data: { status: 'BOOKED', activeSlot: null, bookingId: booking.id },
    });

    await tx.clientActivity.create({
      data: {
        clientId: client.id,
        type: input.kind === 'TRIAL' ? 'trial.booked' : 'booking.created',
        title: `${input.kind === 'TRIAL' ? 'Trial booked' : 'Booked'}: ${label}`,
        data: { bookingId: booking.id, sessionId: session.id, source: input.source },
        actorId: input.actor.userId,
      },
    });

    return {
      booking,
      membershipName,
      visitsRemaining,
      levelWarning: result.levelWarning,
      trialId,
      trialPaymentId,
      trialPrice,
      sessionFull: booked + 1 >= session.capacity,
    };
  }

  private async afterBooked(created: CreatedBooking, input: BookInput): Promise<void> {
    await this.events.publish<BookingCreatedEvent>(Events.BookingCreated, {
      bookingId: created.booking.id,
      sessionId: created.booking.sessionId,
      clientId: created.booking.clientId,
      kind: created.booking.kind,
      actor: input.actor,
      movedFromBookingId: input.movedFromBookingId,
    });
    if (created.trialId) {
      await this.events.publish<TrialScheduledEvent>(Events.TrialScheduled, {
        trialId: created.trialId,
        sessionId: created.booking.sessionId,
        clientId: created.booking.clientId,
      });
    }
    if (created.sessionFull) {
      await this.events.publish<SessionFullEvent>(Events.SessionFull, { sessionId: created.booking.sessionId });
    }
  }

  private async confirmation(created: CreatedBooking): Promise<BookingConfirmationDto> {
    const dto = await this.bookingDto(created.booking.id);
    return {
      booking: dto,
      membershipName: created.membershipName,
      visitsRemaining: created.visitsRemaining,
      freeCancellationUntil: dto.cancellation?.deadline ?? dto.session.cancellationDeadline,
      freeCancellationAvailable: dto.cancellation ? !dto.cancellation.isLate : false,
      levelWarning: created.levelWarning ? BOOKING_TEXTS[requestLocale()].levelAfterBooking(dto.session.levelLabel, created.levelWarning === 'TOO_LOW') : null,
      trialPaymentId: created.trialPaymentId,
      trialPrice: created.trialPrice,
    };
  }

  // ═════════════════════════ Cancellation ═════════════════════════

  async cancellationPreview(bookingId: string, clientId: string): Promise<CancellationPreviewDto> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, clientId },
      include: { session: { include: { location: true } } },
    });
    if (!booking) throw notFound('Booking');
    const policy = await this.settings.get('cancellation');
    const a = assessCancellation({
      sessionStartsAt: booking.session.startsAt,
      bookedAt: booking.bookedAt,
      now: this.clock.now(),
      policy,
      tz: booking.session.location.timezone,
      visitDeducted: booking.visitDeducted,
    });
    const canCancel = booking.status === 'BOOKED' && !a.sessionStarted && booking.session.status === 'SCHEDULED';
    const locale = requestLocale();
    const text = BOOKING_TEXTS[locale];
    if (!canCancel) {
      return {
        canCancel: false,
        isLate: a.isLate,
        deadline: a.deadline,
        visitWillBeReturned: false,
        title: text.cannotCancel,
        message: localizeError(ERROR_CATALOG.BOOKING_NOT_CANCELLABLE.message, locale),
      };
    }
    if (a.isLate) {
      return {
        canCancel: true,
        isLate: true,
        deadline: a.deadline,
        visitWillBeReturned: false,
        title: text.lateTitle,
        message: booking.visitDeducted ? text.lateVisitLost : text.lateNoVisit,
      };
    }
    return {
      canCancel: true,
      isLate: false,
      deadline: a.deadline,
      visitWillBeReturned: a.visitReturned,
      title: text.cancelTitle,
      message: a.visitReturned ? text.visitReturned : text.bookingCancelled,
    };
  }

  async cancelByClient(bookingId: string, clientId: string, user: AuthUser, dto: CancelBookingDto): Promise<CancellationResultDto> {
    const outcome = await this.cancelWithLocks(bookingId, {
      actor: { userId: user.id, source: 'CLIENT' },
      source: 'CLIENT',
      clientScopeId: clientId,
      acknowledgeLate: dto.acknowledgeLate,
      reason: dto.reason ?? null,
    });
    await this.afterCancelled(outcome, { userId: user.id, source: 'CLIENT' }, false);
    return this.cancellationResult(outcome);
  }

  async cancelByAdmin(bookingId: string, dto: AdminCancelBookingDto, actor: AuthUser): Promise<CancellationResultDto> {
    if (dto.waivePenalty && !hasPermission(actor, 'bookings.override')) {
      throw new DomainError('FORBIDDEN', { message: 'Waiving the penalty requires the "override" permission.' });
    }
    const before = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    const outcome = await this.cancelWithLocks(bookingId, {
      actor: { userId: actor.id, source: 'ADMIN' },
      source: 'ADMIN',
      waivePenalty: dto.waivePenalty,
      reason: dto.reason,
    });
    await this.audit.log({
      actor,
      action: 'booking.cancel',
      entityType: 'Booking',
      entityId: bookingId,
      oldValue: { status: before?.status },
      newValue: { status: outcome.booking.status, visitReturned: outcome.visitReturned, waivePenalty: !!dto.waivePenalty },
      reason: dto.reason,
    });
    await this.afterCancelled(outcome, { userId: actor.id, source: 'ADMIN' }, dto.notifyClient !== false);
    return this.cancellationResult(outcome);
  }

  private async cancelWithLocks(bookingId: string, opts: CancelOptions): Promise<CancelOutcome> {
    const ref = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { clientId: true, sessionId: true } });
    if (!ref || (opts.clientScopeId && ref.clientId !== opts.clientScopeId)) throw notFound('Booking');
    return this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'clients', [ref.clientId]);
      await lockRows(tx, 'sessions', [ref.sessionId]);
      await lockRows(tx, 'bookings', [bookingId]);
      return this.cancelLocked(tx, bookingId, opts);
    });
  }

  /** Core cancellation step. Caller must hold locks on the client, session and booking. */
  private async cancelLocked(tx: Tx, bookingId: string, opts: CancelOptions): Promise<CancelOutcome> {
    const now = this.clock.now();
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { session: { include: { location: true, groupType: true } } },
    });
    if (!booking || (opts.clientScopeId && booking.clientId !== opts.clientScopeId)) throw notFound('Booking');
    if (booking.status !== 'BOOKED') throw new DomainError('BOOKING_NOT_CANCELLABLE');

    const policy = await this.settings.get('cancellation');
    const a = assessCancellation({
      sessionStartsAt: booking.session.startsAt,
      bookedAt: booking.bookedAt,
      now,
      policy,
      tz: booking.session.location.timezone,
      visitDeducted: booking.visitDeducted,
    });
    if (opts.source === 'CLIENT') {
      if (a.sessionStarted || booking.session.status !== 'SCHEDULED') throw new DomainError('BOOKING_NOT_CANCELLABLE');
      if (a.isLate && !opts.acknowledgeLate) {
        throw new DomainError('BOOKING_LATE_CANCELLATION_CONFIRMATION_REQUIRED', { details: { deadline: a.deadline } });
      }
    }
    const waived = opts.source !== 'CLIENT' && !!opts.waivePenalty;
    const late = a.isLate && !waived;
    const visitReturned = booking.visitDeducted && !late;

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: late ? 'LATE_CANCELLED' : 'CANCELLED',
        activeSlot: null,
        cancelledAt: now,
        cancelledById: opts.actor.userId,
        cancellationSource: opts.source,
        cancelReason: opts.reason ?? null,
        visitReturned,
      },
    });
    if (visitReturned && booking.membershipId) {
      await this.ledger.post(tx, {
        membershipId: booking.membershipId,
        type: opts.refundType ?? (a.isLate ? 'ADMIN_RETURN' : 'CANCELLATION_REFUND'),
        delta: 1,
        bookingId,
        reason: opts.reason ?? (a.isLate ? 'Cancelled without penalty' : 'Cancelled before the deadline'),
        createdById: opts.actor.userId,
      });
    }
    if (booking.kind === 'TRIAL') {
      const trial = await tx.trial.findUnique({ where: { bookingId } });
      if (trial) {
        const mode = opts.trialMode ?? 'CANCEL';
        if (mode === 'MOVE') {
          await tx.trial.update({ where: { id: trial.id }, data: { bookingId: null } });
        } else if (mode === 'RESCHEDULE') {
          await tx.trial.update({ where: { id: trial.id }, data: { status: 'REQUESTED', bookingId: null, sessionId: null } });
        } else {
          await tx.trial.update({ where: { id: trial.id }, data: { status: 'CANCELLED', bookingId: null } });
          await tx.payment.updateMany({
            where: { trialId: trial.id, status: 'PENDING' },
            data: { status: 'CANCELLED', cancelledAt: now, failureReason: 'Trial booking cancelled' },
          });
        }
      }
    }
    const title = booking.session.title ?? booking.session.groupType?.name ?? 'Speaking Club';
    await tx.clientActivity.create({
      data: {
        clientId: booking.clientId,
        type: late ? 'booking.late_cancelled' : 'booking.cancelled',
        title: `${late ? 'Late cancellation' : 'Cancelled'}: ${title}, ${formatSessionTime(booking.session.startsAt, booking.session.location.timezone)}${visitReturned ? ' — visit returned' : booking.visitDeducted ? ' — visit not returned' : ''}`,
        data: { bookingId, source: opts.source, reason: opts.reason ?? null },
        actorId: opts.actor.userId,
      },
    });
    return { booking: updated, isLate: late, visitReturned, sessionStarted: a.sessionStarted };
  }

  private async afterCancelled(outcome: CancelOutcome, actor: ActorRef, notifyClient: boolean, movedToBookingId?: string) {
    await this.events.publish<BookingCancelledEvent>(Events.BookingCancelled, {
      bookingId: outcome.booking.id,
      sessionId: outcome.booking.sessionId,
      clientId: outcome.booking.clientId,
      isLate: outcome.isLate,
      visitReturned: outcome.visitReturned,
      actor,
      notifyClient,
      movedToBookingId,
    });
    if (!outcome.sessionStarted) {
      await this.events.publish<SeatReleasedEvent>(Events.SeatReleased, { sessionId: outcome.booking.sessionId });
    }
  }

  private async cancellationResult(outcome: CancelOutcome): Promise<CancellationResultDto> {
    const dto = await this.bookingDto(outcome.booking.id);
    const membership = outcome.booking.membershipId
      ? await this.prisma.membership.findUnique({ where: { id: outcome.booking.membershipId }, select: { visitsRemaining: true } })
      : null;
    return { booking: dto, visitReturned: outcome.visitReturned, isLate: outcome.isLate, visitsRemaining: membership?.visitsRemaining ?? null };
  }

  // ═════════════════════════ Admin operations ═════════════════════════

  /** Moves a client to another session: the original visit is returned and a new one used. */
  async moveBooking(bookingId: string, dto: MoveBookingDto, actor: AuthUser): Promise<BookingConfirmationDto> {
    if ((dto.overrideCapacity || dto.overrideRules) && !hasPermission(actor, 'bookings.override')) {
      throw new DomainError('FORBIDDEN', { message: 'You need the "override" permission for this.' });
    }
    const ref = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!ref) throw notFound('Booking');
    if (ref.sessionId === dto.targetSessionId) throw new DomainError('BOOKING_ALREADY_BOOKED');
    const actorRef: ActorRef = { userId: actor.id, source: 'ADMIN' };
    const reason = dto.reason ?? 'Moved to another session';

    const { outcome, created } = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'clients', [ref.clientId]);
      await lockRows(tx, 'sessions', [ref.sessionId, dto.targetSessionId]);
      await lockRows(tx, 'bookings', [bookingId]);
      const trial = ref.kind === 'TRIAL' ? await tx.trial.findUnique({ where: { bookingId } }) : null;
      const outcome = await this.cancelLocked(tx, bookingId, {
        actor: actorRef,
        source: 'ADMIN',
        waivePenalty: true,
        reason,
        refundType: 'CANCELLATION_REFUND',
        trialMode: 'MOVE',
      });
      const created = await this.createBookingLocked(tx, {
        sessionId: dto.targetSessionId,
        clientId: ref.clientId,
        kind: ref.kind,
        source: 'ADMIN',
        actor: actorRef,
        membershipId: ref.kind === 'MEMBERSHIP' && ref.membershipId ? ref.membershipId : undefined,
        trialId: trial?.id,
        overrides: {
          capacity: dto.overrideCapacity,
          window: dto.overrideRules,
          level: dto.overrideRules,
          category: dto.overrideRules,
          overlap: dto.overrideRules,
          trialLimit: true,
        },
        movedFromBookingId: bookingId,
      });
      await this.audit.log(
        {
          actor,
          action: 'booking.move',
          entityType: 'Booking',
          entityId: bookingId,
          oldValue: { sessionId: ref.sessionId },
          newValue: { sessionId: dto.targetSessionId, newBookingId: created.booking.id },
          reason,
        },
        tx,
      );
      return { outcome, created };
    });
    await this.afterCancelled(outcome, actorRef, false, created.booking.id);
    await this.afterBooked(created, {
      sessionId: dto.targetSessionId,
      clientId: ref.clientId,
      kind: ref.kind,
      source: 'ADMIN',
      actor: actorRef,
      movedFromBookingId: bookingId,
    });
    return this.confirmation(created);
  }

  /** Cancels a session: every booking is cancelled without penalty and visits are returned. */
  async cancelSession(sessionId: string, dto: CancelSessionDto, actor: AuthUser | null): Promise<SessionCancellationResultDto> {
    const actorRef: ActorRef = { userId: actor?.id ?? null, source: actor ? 'ADMIN' : 'SYSTEM' };
    const result = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'sessions', [sessionId]);
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) throw notFound('Session');
      if (session.status === 'CANCELLED') throw new DomainError('SESSION_ALREADY_CANCELLED');
      const now = this.clock.now();
      await tx.session.update({
        where: { id: sessionId },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: dto.reason, isDetached: session.templateId ? true : session.isDetached },
      });
      const bookings = await tx.booking.findMany({ where: { sessionId, status: 'BOOKED' }, select: { id: true, clientId: true } });
      let visitsReturned = 0;
      for (const b of bookings) {
        await lockRows(tx, 'bookings', [b.id]);
        const outcome = await this.cancelLocked(tx, b.id, {
          actor: actorRef,
          source: actor ? 'ADMIN' : 'SYSTEM',
          waivePenalty: true,
          reason: `Session cancelled: ${dto.reason}`,
          refundType: 'SESSION_CANCELLED_REFUND',
          trialMode: 'RESCHEDULE',
        });
        if (outcome.visitReturned) visitsReturned += 1;
      }
      const waitlist = await tx.waitlistEntry.updateMany({
        where: { sessionId, activeSlot: true },
        data: { status: 'CANCELLED', activeSlot: null },
      });
      if (actor) {
        await this.audit.log(
          {
            actor,
            action: 'session.cancel',
            entityType: 'Session',
            entityId: sessionId,
            oldValue: { status: 'SCHEDULED' },
            newValue: { status: 'CANCELLED', bookingsCancelled: bookings.length, visitsReturned },
            reason: dto.reason,
          },
          tx,
        );
      }
      return { bookingIds: bookings.map((b) => b.id), visitsReturned, waitlistCancelled: waitlist.count };
    });
    await this.events.publish<SessionCancelledEvent>(Events.SessionCancelled, {
      sessionId,
      affectedBookingIds: dto.notifyClients === false ? [] : result.bookingIds,
      reason: dto.reason,
      actor: actorRef,
    });
    return {
      sessionId,
      cancelledBookings: result.bookingIds.length,
      visitsReturned: result.visitsReturned,
      waitlistCancelled: result.waitlistCancelled,
    };
  }

  async adminSessionDetail(sessionId: string): Promise<AdminSessionDetailDto> {
    const row = await this.read.findOne(sessionId);
    if (!row) throw notFound('Session');
    const ctx = await this.read.context([sessionId]);
    const bookings = await this.prisma.booking.findMany({
      where: { sessionId },
      include: {
        client: { include: { level: { select: { name: true } } } },
        attendance: true,
        membership: { select: { planName: true, visitsRemaining: true } },
        feedback: { select: { id: true } },
      },
      orderBy: [{ bookedAt: 'asc' }],
    });
    const clientIds = [...new Set(bookings.map((b) => b.clientId))];
    const priorVisits = clientIds.length
      ? await this.prisma.booking.groupBy({
          by: ['clientId'],
          where: { clientId: { in: clientIds }, status: 'ATTENDED', session: { startsAt: { lt: row.startsAt } } },
          _count: { _all: true },
        })
      : [];
    const visited = new Set(priorVisits.filter((p) => p._count._all > 0).map((p) => p.clientId));
    const toParticipant = (b: (typeof bookings)[number]): ParticipantDto => ({
      bookingId: b.id,
      client: this.participantClient(b.client),
      status: b.status,
      kind: b.kind,
      source: b.source,
      bookedAt: b.bookedAt,
      membershipName: b.membership?.planName ?? null,
      membershipVisitsRemaining: b.membership?.visitsRemaining ?? null,
      attendance: b.attendance ? { status: b.attendance.status, method: b.attendance.method, markedAt: b.attendance.markedAt } : null,
      capacityOverride: b.capacityOverride,
      notes: b.notes,
      hasFeedback: !!b.feedback,
      isFirstVisit: !visited.has(b.clientId),
      cancelledAt: b.cancelledAt,
      cancelReason: b.cancelReason,
      visitReturned: b.visitReturned,
    });
    const waitlist = await this.prisma.waitlistEntry.findMany({
      where: { sessionId, activeSlot: true },
      include: { client: { include: { level: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      session: this.read.toDto(row, ctx),
      onlineUrl: row.onlineUrl,
      isDetached: row.isDetached,
      cancelReason: row.cancelReason,
      attendanceFinalizedAt: row.attendanceFinalizedAt,
      participants: bookings.filter((b) => b.activeSlot).map(toParticipant),
      cancelled: bookings.filter((b) => !b.activeSlot).map(toParticipant),
      waitlist: waitlist.map((w, index) => ({
        entryId: w.id,
        client: this.participantClient(w.client),
        status: w.status,
        position: index + 1,
        offerExpiresAt: w.offerExpiresAt,
        createdAt: w.createdAt,
      })),
    };
  }

  async listAdmin(query: AdminBookingsQueryDto): Promise<AdminBookingPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.BookingWhereInput = {
      sessionId: query.sessionId,
      clientId: query.clientId,
      status: query.status,
      kind: query.kind,
      session:
        query.from || query.to
          ? { startsAt: { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? new Date(query.to) : undefined } }
          : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: { ...bookingInclude, client: { include: { level: { select: { name: true } } } } },
        orderBy: [{ session: { startsAt: 'desc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    const dtos = await this.toDtos(rows);
    return {
      items: dtos.map((dto, i) => ({ ...dto, client: this.participantClient(rows[i].client) })),
      total,
      page,
      pageSize,
    };
  }

  private participantClient(c: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    photoUrl: string | null;
    category: ParticipantClientDto['category'];
    level: { name: string } | null;
  }): ParticipantClientDto {
    return {
      id: c.id,
      name: fullName(c.firstName, c.lastName),
      firstName: c.firstName,
      phone: c.phone,
      photoUrl: c.photoUrl,
      category: c.category,
      levelName: c.level?.name ?? null,
    };
  }

  // ═════════════════════════ Client lists ═════════════════════════

  async myBookings(clientId: string, query: MyBookingsQueryDto): Promise<MyBookingsDto> {
    const now = this.clock.now();
    const scope = query.scope ?? 'upcoming';
    const limit = query.limit ?? 50;
    const where: Prisma.BookingWhereInput =
      scope === 'upcoming'
        ? { clientId, status: 'BOOKED', session: { endsAt: { gt: now } } }
        : scope === 'past'
          ? { clientId, OR: [{ status: { not: 'BOOKED' } }, { session: { endsAt: { lte: now } } }] }
          : { clientId };
    const rows = await this.prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { session: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' } },
      take: limit,
    });
    const items = await this.toDtos(rows);
    let waitlist: WaitlistItemDto[] = [];
    if (scope !== 'past') {
      const entries = await this.prisma.waitlistEntry.findMany({
        where: { clientId, activeSlot: true, session: { startsAt: { gt: now } } },
        orderBy: { session: { startsAt: 'asc' } },
      });
      if (entries.length) {
        const sessions = await this.read.findMany({ id: { in: entries.map((e) => e.sessionId) } });
        const ctx = await this.read.context(sessions.map((s) => s.id));
        const byId = new Map(sessions.map((s) => [s.id, s]));
        waitlist = await Promise.all(
          entries.map(async (e) => ({
            id: e.id,
            status: e.status,
            position:
              (await this.prisma.waitlistEntry.count({
                where: { sessionId: e.sessionId, activeSlot: true, createdAt: { lt: e.createdAt } },
              })) + 1,
            offerExpiresAt: e.offerExpiresAt,
            createdAt: e.createdAt,
            session: this.read.toDto(byId.get(e.sessionId)!, ctx),
          })),
        );
      }
    }
    return { items, waitlist };
  }

  async myAttendance(clientId: string): Promise<MyAttendanceDto> {
    const now = this.clock.now();
    const rows = await this.prisma.booking.findMany({
      where: {
        clientId,
        OR: [{ status: { in: ['ATTENDED', 'NO_SHOW', 'CANCELLED', 'LATE_CANCELLED'] } }, { session: { endsAt: { lte: now } } }],
      },
      include: bookingInclude,
      orderBy: { session: { startsAt: 'desc' } },
      take: 200,
    });
    const counts = await this.prisma.booking.groupBy({ by: ['status'], where: { clientId }, _count: { _all: true } });
    const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    const attended = count('ATTENDED');
    const noShows = count('NO_SHOW');
    return {
      summary: {
        attended,
        noShows,
        cancelled: count('CANCELLED'),
        lateCancelled: count('LATE_CANCELLED'),
        attendanceRate: attended + noShows ? Math.round((attended / (attended + noShows)) * 100) : 0,
      },
      items: await this.toDtos(rows),
    };
  }

  async getForClient(bookingId: string, clientId: string): Promise<BookingDto> {
    const row = await this.prisma.booking.findFirst({ where: { id: bookingId, clientId }, include: bookingInclude });
    if (!row) throw notFound('Booking');
    return (await this.toDtos([row]))[0];
  }

  async icsForClient(bookingId: string, clientId: string): Promise<{ filename: string; content: string }> {
    const booking = await this.getForClient(bookingId, clientId);
    const s = booking.session;
    const club = await this.settings.get('club');
    const location = [club.name, s.location.address, s.location.addressDetails, 'Almaty'].filter(Boolean).join(', ');
    const text = BOOKING_TEXTS[requestLocale()].calendar;
    const content = buildIcs(
      {
        uid: `booking-${booking.id}@talkclub`,
        start: s.startsAt,
        end: s.endsAt,
        summary: `${club.name}: ${s.title}${s.teacher ? text.with(s.teacher.name) : ''}`,
        description: [`${text.level}: ${s.levelLabel}`, s.room ? `${text.room}: ${s.room.name}` : null, booking.onlineUrl ? `${text.join}: ${booking.onlineUrl}` : null]
          .filter(Boolean)
          .join('\n'),
        location: s.format === 'ONLINE' ? (booking.onlineUrl ?? text.online) : location,
        url: `${this.config.appUrl}/bookings/${booking.id}`,
        alarmMinutes: 120,
      },
      this.clock.now(),
    );
    return { filename: `talk-club-${s.localDate}-${s.startTime.replace(':', '')}.ics`, content };
  }

  // ═════════════════════════ Mapping ═════════════════════════

  async bookingDto(bookingId: string): Promise<BookingDto> {
    const row = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
    return (await this.toDtos([row]))[0];
  }

  async toDtos(rows: BookingRow[]): Promise<BookingDto[]> {
    if (!rows.length) return [];
    const ctx = await this.read.context([...new Set(rows.map((r) => r.sessionId))]);
    const policy = await this.settings.get('cancellation');
    return rows.map((r) => toBookingDto(r, this.read, ctx, policy));
  }
}
