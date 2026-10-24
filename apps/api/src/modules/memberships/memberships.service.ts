import { Injectable, Logger } from '@nestjs/common';
import { Membership, Payment, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { ActorRef, Events, MembershipActivatedEvent } from '../../common/events/events';
import { fullName } from '../../common/utils/names';
import { daysBetweenLocal, localDate, localToUtc, zoned } from '../../common/utils/time';
import { computeMembershipExpiry, extendExpiry, membershipDisplayStatus } from '../../domain/membership-rules';
import { Db, lockRows, PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';
import {
  AdminMembershipPageDto,
  GrantMembershipDto,
  MembershipDetailDto,
  MembershipDto,
  MembershipListQueryDto,
  MembershipTransactionDto,
  MyMembershipOverviewDto,
} from './dto/membership.dto';
import { CREDIT_TYPES, MembershipLedgerService, USAGE_TYPES } from './membership-ledger.service';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: MembershipLedgerService,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
  ) {}

  // ─── Reads ───

  async overviewForClient(clientId: string): Promise<MyMembershipOverviewDto> {
    const rows = await this.prisma.membership.findMany({
      where: { clientId },
      orderBy: [{ expiresAt: 'desc' }],
    });
    const dtos = await this.toDtos(rows);
    const active = dtos
      .filter((m) => m.status === 'ACTIVE' || m.status === 'USED_UP' || m.status === 'NOT_STARTED')
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    const past = dtos.filter((m) => !active.includes(m));
    const current = active.find((m) => m.status === 'ACTIVE') ?? active[0] ?? null;
    return { current, active, past };
  }

  async detailForClient(clientId: string, membershipId: string): Promise<MembershipDetailDto> {
    const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, clientId } });
    if (!membership) throw notFound('Membership');
    return this.detail(membership);
  }

  async detailById(membershipId: string): Promise<MembershipDetailDto> {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership) throw notFound('Membership');
    return this.detail(membership);
  }

  async listAdmin(query: MembershipListQueryDto): Promise<AdminMembershipPageDto> {
    const now = this.clock.now();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const expiringDays = (await this.settings.get('crm')).expiringSoonDays;
    const where: Prisma.MembershipWhereInput = {
      clientId: query.clientId,
      planId: query.planId,
      ...(query.status === 'ACTIVE' && { status: 'ACTIVE', expiresAt: { gt: now }, visitsRemaining: { gt: 0 } }),
      ...(query.status === 'USED_UP' && { status: 'ACTIVE', expiresAt: { gt: now }, visitsRemaining: 0 }),
      ...(query.status === 'EXPIRING' && {
        status: 'ACTIVE',
        expiresAt: { gt: now, lte: new Date(now.getTime() + expiringDays * 86_400_000) },
      }),
      ...(query.status === 'EXPIRED' && { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiresAt: { lte: now } }] }),
      ...(query.status === 'CANCELLED' && { status: 'CANCELLED' }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: { client: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: query.status === 'EXPIRING' ? { expiresAt: 'asc' } : { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.membership.count({ where }),
    ]);
    const dtos = await this.toDtos(rows);
    return {
      items: dtos.map((dto, i) => ({
        ...dto,
        clientName: fullName(rows[i].client.firstName, rows[i].client.lastName),
        clientPhone: rows[i].client.phone,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Active memberships usable for booking, used by the booking engine. */
  activeForClient(db: Db, clientId: string) {
    return db.membership.findMany({
      where: { clientId, status: 'ACTIVE' },
      include: { plan: { include: { groupTypes: true } } },
    });
  }

  // ─── Activation (payment confirmed) and grants ───

  /**
   * Creates and activates a membership for a confirmed payment:
   * start = now, expiry = end of day (start + plan validity), visits credited
   * through the ledger (PURCHASE). Idempotent per payment.
   */
  async activateFromPayment(tx: Tx, payment: Payment, actorUserId: string | null): Promise<Membership> {
    const existing = await tx.membership.findUnique({ where: { paymentId: payment.id } });
    if (existing) return existing;
    if (!payment.membershipPlanId) throw new DomainError('MEMBERSHIP_PLAN_UNAVAILABLE');
    const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: payment.membershipPlanId } });
    const tz = await this.catalog.defaultTimezone();
    const startsAt = this.clock.now();
    return this.createMembership(tx, {
      clientId: payment.clientId,
      plan,
      startsAt,
      expiresAt: computeMembershipExpiry(startsAt, plan.validityDays, tz),
      visits: plan.visits,
      price: payment.amount,
      paymentId: payment.id,
      txType: 'PURCHASE',
      reason: `Payment ${payment.reference ?? payment.id.slice(0, 8)}`,
      actorUserId,
    });
  }

  async grant(dto: GrantMembershipDto, actor: AuthUser): Promise<MembershipDetailDto> {
    const tz = await this.catalog.defaultTimezone();
    const membership = await this.prisma.transaction(async (tx) => {
      const plan = await tx.membershipPlan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw notFound('Plan');
      const client = await tx.client.findUnique({ where: { id: dto.clientId } });
      if (!client) throw notFound('Client');
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : this.clock.now();
      const created = await this.createMembership(tx, {
        clientId: client.id,
        plan,
        startsAt,
        expiresAt: computeMembershipExpiry(startsAt, dto.validityDays ?? plan.validityDays, tz),
        visits: dto.visits ?? plan.visits,
        price: 0,
        paymentId: null,
        txType: 'GRANT',
        reason: dto.reason,
        actorUserId: actor.id,
      });
      await this.audit.log(
        {
          actor,
          action: 'membership.grant',
          entityType: 'Membership',
          entityId: created.id,
          newValue: { planName: plan.name, visits: created.visitsTotal, expiresAt: created.expiresAt },
          reason: dto.reason,
        },
        tx,
      );
      return created;
    });
    await this.publishActivated(membership, { userId: actor.id, source: 'ADMIN' });
    return this.detailById(membership.id);
  }

  private async createMembership(
    tx: Tx,
    input: {
      clientId: string;
      plan: { id: string; name: string; programId: string };
      startsAt: Date;
      expiresAt: Date;
      visits: number;
      price: number;
      paymentId: string | null;
      txType: 'PURCHASE' | 'GRANT';
      reason: string;
      actorUserId: string | null;
    },
  ): Promise<Membership> {
    const previous = await tx.membership.count({ where: { clientId: input.clientId, programId: input.plan.programId } });
    const membership = await tx.membership.create({
      data: {
        clientId: input.clientId,
        planId: input.plan.id,
        programId: input.plan.programId,
        planName: input.plan.name,
        visitsTotal: input.visits,
        visitsRemaining: 0,
        price: input.price,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        originalExpiresAt: input.expiresAt,
        paymentId: input.paymentId,
        isRenewal: previous > 0,
        activatedById: input.actorUserId,
      },
    });
    await this.ledger.post(tx, {
      membershipId: membership.id,
      type: input.txType,
      delta: input.visits,
      reason: input.reason,
      createdById: input.actorUserId,
    });
    await tx.clientActivity.create({
      data: {
        clientId: input.clientId,
        type: 'membership.activated',
        title: `${input.plan.name} membership activated (${input.visits} visits)`,
        data: { membershipId: membership.id, expiresAt: input.expiresAt.toISOString() },
        actorId: input.actorUserId,
      },
    });
    return { ...membership, visitsRemaining: input.visits };
  }

  async publishActivated(membership: Membership, actor: ActorRef): Promise<void> {
    await this.events.publish<MembershipActivatedEvent>(Events.MembershipActivated, {
      membershipId: membership.id,
      clientId: membership.clientId,
      paymentId: membership.paymentId,
      isRenewal: membership.isRenewal,
      actor,
    });
  }

  // ─── Admin overrides (always audited, always with a reason) ───

  async extend(id: string, days: number, reason: string, actor: AuthUser): Promise<MembershipDetailDto> {
    const tz = await this.catalog.defaultTimezone();
    await this.prisma.transaction(async (tx) => {
      const m = await this.lockedMembership(tx, id);
      if (m.status === 'CANCELLED') throw new DomainError('MEMBERSHIP_NOT_ACTIVE');
      const newExpiry = extendExpiry(m.expiresAt, days, tz);
      await this.changeExpiry(tx, m, newExpiry, reason, actor, `Extended by ${days} day(s)`);
    });
    return this.detailById(id);
  }

  async setExpiry(id: string, expiresOn: string, reason: string, actor: AuthUser): Promise<MembershipDetailDto> {
    const tz = await this.catalog.defaultTimezone();
    await this.prisma.transaction(async (tx) => {
      const m = await this.lockedMembership(tx, id);
      if (m.status === 'CANCELLED') throw new DomainError('MEMBERSHIP_NOT_ACTIVE');
      const newExpiry = zoned(localToUtc(expiresOn, '00:00', tz), tz).endOf('day').toJSDate();
      if (newExpiry <= m.startsAt) throw new DomainError('VALIDATION_FAILED', { message: 'Expiry must be after the start date.' });
      await this.changeExpiry(tx, m, newExpiry, reason, actor, `Expiry changed to ${expiresOn}`);
    });
    return this.detailById(id);
  }

  private async changeExpiry(tx: Tx, m: Membership, newExpiry: Date, reason: string, actor: AuthUser, label: string) {
    const now = this.clock.now();
    await tx.membership.update({
      where: { id: m.id },
      data: {
        expiresAt: newExpiry,
        // Extending an expired membership re-activates it; shortening into the past expires it.
        status: newExpiry > now ? 'ACTIVE' : 'EXPIRED',
      },
    });
    await this.ledger.post(tx, {
      membershipId: m.id,
      type: 'EXTENSION',
      delta: 0,
      reason: `${label}: ${reason}`,
      createdById: actor.id,
      expiresAtBefore: m.expiresAt,
      expiresAtAfter: newExpiry,
    });
    await this.audit.log(
      {
        actor,
        action: 'membership.expiry_change',
        entityType: 'Membership',
        entityId: m.id,
        oldValue: { expiresAt: m.expiresAt, status: m.status },
        newValue: { expiresAt: newExpiry },
        reason,
      },
      tx,
    );
    await tx.clientActivity.create({
      data: { clientId: m.clientId, type: 'membership.extended', title: `${m.planName}: ${label}`, data: { reason }, actorId: actor.id },
    });
  }

  async adjustVisits(id: string, delta: number, reason: string, actor: AuthUser): Promise<MembershipDetailDto> {
    await this.prisma.transaction(async (tx) => {
      const m = await this.lockedMembership(tx, id);
      if (m.status === 'CANCELLED') throw new DomainError('MEMBERSHIP_NOT_ACTIVE');
      const entry = await this.ledger.post(tx, {
        membershipId: id,
        type: 'ADMIN_ADJUSTMENT',
        delta,
        reason,
        createdById: actor.id,
      });
      await this.audit.log(
        {
          actor,
          action: 'membership.adjust_visits',
          entityType: 'Membership',
          entityId: id,
          oldValue: { visitsRemaining: m.visitsRemaining },
          newValue: { visitsRemaining: entry.balanceAfter, delta },
          reason,
        },
        tx,
      );
      await tx.clientActivity.create({
        data: {
          clientId: m.clientId,
          type: 'membership.adjusted',
          title: `${m.planName}: ${delta > 0 ? `+${delta}` : delta} visit(s) — ${reason}`,
          actorId: actor.id,
        },
      });
    });
    return this.detailById(id);
  }

  /** Returns the visit of a late-cancelled / no-show booking (exceptional situations). */
  async returnVisit(bookingId: string, reason: string, actor: AuthUser): Promise<MembershipDetailDto> {
    const membershipId = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'bookings', [bookingId]);
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: true } });
      if (!booking) throw notFound('Booking');
      if (!booking.membershipId || !booking.visitDeducted) {
        throw new DomainError('CONFLICT', { message: 'This booking did not use a membership visit.' });
      }
      if (booking.visitReturned) throw new DomainError('CONFLICT', { message: 'The visit was already returned.' });
      if (booking.status === 'BOOKED') {
        throw new DomainError('CONFLICT', { message: 'Cancel the booking without penalty instead.' });
      }
      await this.ledger.post(tx, {
        membershipId: booking.membershipId,
        type: 'ADMIN_RETURN',
        delta: 1,
        bookingId,
        reason,
        createdById: actor.id,
      });
      await tx.booking.update({ where: { id: bookingId }, data: { visitReturned: true } });
      await this.audit.log(
        {
          actor,
          action: 'membership.return_visit',
          entityType: 'Booking',
          entityId: bookingId,
          oldValue: { status: booking.status, visitReturned: false },
          newValue: { visitReturned: true },
          reason,
        },
        tx,
      );
      await tx.clientActivity.create({
        data: { clientId: booking.clientId, type: 'membership.visit_returned', title: `Visit returned — ${reason}`, actorId: actor.id },
      });
      return booking.membershipId;
    });
    return this.detailById(membershipId);
  }

  async cancel(id: string, reason: string, actor: AuthUser): Promise<MembershipDetailDto> {
    await this.prisma.transaction(async (tx) => {
      const m = await this.lockedMembership(tx, id);
      if (m.status === 'CANCELLED') return;
      const upcoming = await tx.booking.count({
        where: { membershipId: id, status: 'BOOKED', session: { startsAt: { gt: this.clock.now() } } },
      });
      if (upcoming > 0) {
        throw new DomainError('CONFLICT', {
          message: `This membership has ${upcoming} upcoming booking(s). Cancel or move them first.`,
        });
      }
      await tx.membership.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: this.clock.now(), cancelReason: reason },
      });
      await this.audit.log(
        { actor, action: 'membership.cancel', entityType: 'Membership', entityId: id, oldValue: { status: m.status }, newValue: { status: 'CANCELLED' }, reason },
        tx,
      );
    });
    return this.detailById(id);
  }

  /** Background job: mark memberships past their expiry as EXPIRED. Returns the number changed. */
  async expireDue(): Promise<number> {
    const result = await this.prisma.membership.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: this.clock.now() } },
      data: { status: 'EXPIRED' },
    });
    if (result.count) this.logger.log(`Expired ${result.count} membership(s)`);
    return result.count;
  }

  private async lockedMembership(tx: Tx, id: string): Promise<Membership> {
    await lockRows(tx, 'memberships', [id]);
    const m = await tx.membership.findUnique({ where: { id } });
    if (!m) throw notFound('Membership');
    return m;
  }

  // ─── Mapping ───

  async toDtos(rows: Membership[], db: Db = this.prisma): Promise<MembershipDto[]> {
    if (!rows.length) return [];
    const tz = await this.catalog.defaultTimezone();
    const now = this.clock.now();
    const sums = await db.membershipTransaction.groupBy({
      by: ['membershipId', 'type'],
      where: { membershipId: { in: rows.map((r) => r.id) } },
      _sum: { delta: true },
    });
    const usage = new Map<string, { credited: number; used: number }>();
    for (const s of sums) {
      const u = usage.get(s.membershipId) ?? { credited: 0, used: 0 };
      const delta = s._sum.delta ?? 0;
      if (CREDIT_TYPES.includes(s.type)) u.credited += delta;
      else if (USAGE_TYPES.includes(s.type)) u.used -= delta;
      usage.set(s.membershipId, u);
    }
    return rows.map((m) => {
      const u = usage.get(m.id) ?? { credited: m.visitsTotal, used: m.visitsTotal - m.visitsRemaining };
      return {
        id: m.id,
        clientId: m.clientId,
        planId: m.planId,
        planName: m.planName,
        programId: m.programId,
        status: membershipDisplayStatus(m, now),
        visitsTotal: m.visitsTotal,
        visitsCredited: u.credited,
        visitsUsed: Math.max(0, u.used),
        visitsRemaining: m.visitsRemaining,
        price: m.price,
        currency: 'KZT',
        startsAt: m.startsAt,
        expiresAt: m.expiresAt,
        originalExpiresAt: m.originalExpiresAt,
        expiresOn: localDate(m.expiresAt, tz),
        daysLeft: daysBetweenLocal(now, m.expiresAt, tz),
        isRenewal: m.isRenewal,
        paymentId: m.paymentId,
        cancelReason: m.cancelReason,
        createdAt: m.createdAt,
      };
    });
  }

  private async detail(membership: Membership): Promise<MembershipDetailDto> {
    const [dto] = await this.toDtos([membership]);
    const transactions = await this.prisma.membershipTransaction.findMany({
      where: { membershipId: membership.id },
      orderBy: { createdAt: 'asc' },
      include: {
        booking: {
          include: {
            session: {
              include: { teacher: { select: { firstName: true, lastName: true } }, groupType: { select: { name: true } } },
            },
          },
        },
      },
    });
    const actorIds = [...new Set(transactions.map((t) => t.createdById).filter((v): v is string => !!v))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })
      : [];
    const actorLabels = new Map(actors.map((a) => [a.id, a.displayName]));
    const items: MembershipTransactionDto[] = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      delta: t.delta,
      balanceAfter: t.balanceAfter,
      reason: t.reason,
      expiresAtBefore: t.expiresAtBefore,
      expiresAtAfter: t.expiresAtAfter,
      createdAt: t.createdAt,
      createdByLabel: t.createdById ? (actorLabels.get(t.createdById) ?? null) : null,
      booking: t.booking
        ? {
            id: t.booking.id,
            status: t.booking.status,
            visitReturned: t.booking.visitReturned,
            session: {
              id: t.booking.session.id,
              title: t.booking.session.title ?? t.booking.session.groupType?.name ?? 'Speaking Club',
              startsAt: t.booking.session.startsAt,
              teacherName: t.booking.session.teacher
                ? fullName(t.booking.session.teacher.firstName, t.booking.session.teacher.lastName)
                : null,
            },
          }
        : null,
    }));
    return { ...dto, transactions: items };
  }
}
