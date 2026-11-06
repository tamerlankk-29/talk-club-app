import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { pageArgs, pageMeta } from '../../common/dto/pagination.dto';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { ActorRef } from '../../common/events/events';
import { fullName } from '../../common/utils/names';
import { lockRows, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { MembershipsService } from '../memberships/memberships.service';
import { PaymentsService } from '../payments/payments.service';
import {
  GiftCertificateDto,
  GiftCertificatePageDto,
  GiftCertificateQueryDto,
  GiftRedeemedDto,
  SellGiftCertificateDto,
} from './dto/gift-certificate.dto';

/** Unambiguous characters: no 0/O, 1/I/L. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_REDEEM_DAYS = 180;

const include = {
  buyer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  redeemedBy: { select: { id: true, firstName: true, lastName: true, phone: true } },
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.GiftCertificateInclude;
type Row = Prisma.GiftCertificateGetPayload<{ include: typeof include }>;

/** TC-XXXX-XXXX from any spelling the member types (spaces, dashes, lower case). */
export function normalizeGiftCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^TC/, '');
  if (raw.length !== 8 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return `TC-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Gift certificates: a membership bought at the desk for someone else. The sale is a
 * paid payment of the buyer; the recipient redeems the code in the app or at the desk
 * and gets the membership from that day.
 */
@Injectable()
export class GiftCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly memberships: MembershipsService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async list(query: GiftCertificateQueryDto): Promise<GiftCertificatePageDto> {
    const now = this.clock.now();
    const where: Prisma.GiftCertificateWhereInput = {};
    if (query.status === 'EXPIRED') Object.assign(where, { status: 'ACTIVE', expiresAt: { lt: now } });
    else if (query.status === 'ACTIVE') Object.assign(where, { status: 'ACTIVE', expiresAt: { gte: now } });
    else if (query.status) where.status = query.status;
    const q = query.q?.trim();
    if (q) {
      const code = normalizeGiftCode(q);
      where.OR = [
        ...(code ? [{ code }] : []),
        { code: { contains: q.toUpperCase() } },
        { recipientName: { contains: q, mode: 'insensitive' } },
        { buyer: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.giftCertificate.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.giftCertificate.count({ where }),
    ]);
    return { items: rows.map((r) => this.toDto(r, now)), meta: pageMeta(query, total) };
  }

  async get(id: string): Promise<GiftCertificateDto> {
    const row = await this.prisma.giftCertificate.findUnique({ where: { id }, include });
    if (!row) throw notFound('Gift certificate');
    return this.toDto(row, this.clock.now());
  }

  /** Records a certificate sold and paid at the desk. */
  async sell(dto: SellGiftCertificateDto, actor: AuthUser): Promise<GiftCertificateDto> {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new DomainError('MEMBERSHIP_PLAN_UNAVAILABLE');
    const price = dto.price ?? plan.price;
    const payment = await this.payments.createRequest(
      {
        clientId: dto.buyerClientId,
        productType: 'GIFT_CERTIFICATE',
        amount: price,
        methodCode: dto.methodCode,
        reference: dto.reference,
        description: `Gift certificate: ${plan.name}`,
        markPaid: true,
      },
      actor,
    );
    const tz = await this.catalog.defaultTimezone();
    const expiresAt = DateTime.fromJSDate(this.clock.now(), { zone: tz })
      .plus({ days: dto.redeemWithinDays ?? DEFAULT_REDEEM_DAYS })
      .endOf('day')
      .toJSDate();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const row = await this.prisma.giftCertificate.create({
          data: {
            code: this.newCode(),
            planId: plan.id,
            planName: plan.name,
            visits: plan.visits,
            validityDays: plan.validityDays,
            price,
            buyerClientId: dto.buyerClientId,
            paymentId: payment.id,
            recipientName: dto.recipientName?.trim() || null,
            message: dto.message?.trim() || null,
            expiresAt,
            createdById: actor.id,
          },
          include,
        });
        await this.audit.log({ actor, action: 'giftCertificate.sell', entityType: 'GiftCertificate', entityId: row.id, newValue: { code: row.code, planName: row.planName, price } });
        return this.toDto(row, this.clock.now());
      } catch (error) {
        const codeClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 5;
        if (!codeClash) throw error;
      }
    }
  }

  /** The member (or a parent for their child) redeems a code in the app. */
  async redeem(code: string, clientId: string, actor: AuthUser): Promise<GiftRedeemedDto> {
    const normalized = normalizeGiftCode(code);
    if (!normalized) throw new DomainError('GIFT_CERTIFICATE_INVALID');
    const found = await this.prisma.giftCertificate.findUnique({ where: { code: normalized }, select: { id: true } });
    if (!found) throw new DomainError('GIFT_CERTIFICATE_INVALID');
    return this.activate(found.id, clientId, actor, 'CLIENT');
  }

  /** Staff redeem a certificate for a client at the desk. */
  async redeemForClient(id: string, clientId: string, actor: AuthUser): Promise<GiftRedeemedDto> {
    return this.activate(id, clientId, actor, 'ADMIN');
  }

  async cancel(id: string, reason: string, actor: AuthUser): Promise<GiftCertificateDto> {
    await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'gift_certificates', [id]);
      const row = await tx.giftCertificate.findUnique({ where: { id } });
      if (!row) throw notFound('Gift certificate');
      if (row.status === 'REDEEMED') throw new DomainError('GIFT_CERTIFICATE_USED');
      if (row.status === 'CANCELLED') throw new DomainError('GIFT_CERTIFICATE_CANCELLED');
      await tx.giftCertificate.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: this.clock.now(), cancelReason: reason } });
      await this.audit.log({ actor, action: 'giftCertificate.cancel', entityType: 'GiftCertificate', entityId: id, oldValue: { status: row.status }, newValue: { status: 'CANCELLED' }, reason }, tx);
    });
    return this.get(id);
  }

  private async activate(id: string, clientId: string, actor: AuthUser, source: ActorRef['source']): Promise<GiftRedeemedDto> {
    const membership = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'gift_certificates', [id]);
      const row = await tx.giftCertificate.findUnique({ where: { id } });
      if (!row) throw new DomainError('GIFT_CERTIFICATE_INVALID');
      if (row.status === 'REDEEMED') throw new DomainError('GIFT_CERTIFICATE_USED');
      if (row.status === 'CANCELLED') throw new DomainError('GIFT_CERTIFICATE_CANCELLED');
      if (row.expiresAt < this.clock.now()) throw new DomainError('GIFT_CERTIFICATE_EXPIRED');
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (!client) throw notFound('Client');
      const created = await this.memberships.activateFromGift(tx, {
        clientId,
        planId: row.planId,
        visits: row.visits,
        validityDays: row.validityDays,
        code: row.code,
        actorUserId: actor.id,
      });
      await tx.giftCertificate.update({
        where: { id },
        data: { status: 'REDEEMED', redeemedAt: this.clock.now(), redeemedByClientId: clientId, membershipId: created.id },
      });
      await this.audit.log(
        { actor, action: 'giftCertificate.redeem', entityType: 'GiftCertificate', entityId: id, newValue: { clientId, membershipId: created.id } },
        tx,
      );
      return created;
    });
    await this.memberships.publishActivated(membership, { userId: actor.id, source });
    return { membershipId: membership.id, planName: membership.planName, visits: membership.visitsTotal, expiresAt: membership.expiresAt };
  }

  private newCode(): string {
    const pick = () => ALPHABET[randomInt(ALPHABET.length)];
    const part = () => Array.from({ length: 4 }, pick).join('');
    return `TC-${part()}-${part()}`;
  }

  private toDto(row: Row, now: Date): GiftCertificateDto {
    const client = (c: { id: string; firstName: string; lastName: string | null; phone: string | null } | null) =>
      c ? { id: c.id, name: fullName(c.firstName, c.lastName), phone: c.phone } : null;
    return {
      id: row.id,
      code: row.code,
      planId: row.planId,
      planName: row.planName,
      visits: row.visits,
      validityDays: row.validityDays,
      price: row.price,
      recipientName: row.recipientName,
      message: row.message,
      status: row.status === 'ACTIVE' && row.expiresAt < now ? 'EXPIRED' : row.status,
      expiresAt: row.expiresAt,
      buyer: client(row.buyer)!,
      paymentId: row.paymentId,
      redeemedBy: client(row.redeemedBy),
      redeemedAt: row.redeemedAt,
      membershipId: row.membershipId,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
      createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.displayName ?? '' } : null,
    };
  }
}
