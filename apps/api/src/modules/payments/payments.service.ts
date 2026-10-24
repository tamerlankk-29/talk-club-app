import { Inject, Injectable, Logger } from '@nestjs/common';
import { Membership, Payment, PaymentStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { ActorRef, Events, PaymentConfirmedEvent, PaymentCreatedEvent } from '../../common/events/events';
import { fullName } from '../../common/utils/names';
import { normalizePhone } from '../../common/utils/phone';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { lockRows, PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LegalService } from '../legal/legal.service';
import { MembershipsService } from '../memberships/memberships.service';
import { SettingsService } from '../settings/settings.service';
import {
  AdminPaymentDto,
  AdminPaymentPageDto,
  ConfirmPaymentDto,
  CreatePaymentMethodDto,
  CreatePaymentRequestDto,
  PaymentDto,
  PaymentListQueryDto,
  PaymentMethodDto,
  PurchaseMembershipDto,
  UpdatePaymentMethodDto,
} from './dto/payment.dto';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

const paymentInclude = {
  method: true,
  plan: true,
  membership: { select: { id: true } },
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  createdBy: { select: { id: true, displayName: true } },
  confirmedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviderRegistry,
    private readonly memberships: MembershipsService,
    private readonly legal: LegalService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Payment methods ───

  async methods(forClients: boolean): Promise<PaymentMethodDto[]> {
    const rows = await this.prisma.paymentMethod.findMany({
      where: forClients ? { isActive: true, availableToClients: true } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
    return rows
      .map((m) => ({ ...m, providerReady: this.providers.isAvailable(m.provider) }))
      .filter((m) => !forClients || m.providerReady);
  }

  async createMethod(dto: CreatePaymentMethodDto, actor: AuthUser): Promise<PaymentMethodDto> {
    const method = await this.prisma.paymentMethod.create({ data: dto });
    await this.audit.log({ actor, action: 'paymentMethod.create', entityType: 'PaymentMethod', entityId: method.id, newValue: method });
    return { ...method, providerReady: this.providers.isAvailable(method.provider) };
  }

  async updateMethod(id: string, dto: UpdatePaymentMethodDto, actor: AuthUser): Promise<PaymentMethodDto> {
    const before = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!before) throw notFound('Payment method');
    const method = await this.prisma.paymentMethod.update({ where: { id }, data: dto });
    await this.audit.log({ actor, action: 'paymentMethod.update', entityType: 'PaymentMethod', entityId: id, oldValue: before, newValue: method });
    return { ...method, providerReady: this.providers.isAvailable(method.provider) };
  }

  // ─── Client self-service purchase ───

  /**
   * Client buys a membership: records acceptance of the current public offer,
   * creates a PENDING payment and asks the provider how to pay (checkout link or
   * instructions). The membership is activated when the payment is confirmed.
   */
  async purchase(clientId: string, userId: string, dto: PurchaseMembershipDto): Promise<PaymentDto> {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive || !plan.isPublic) throw new DomainError('MEMBERSHIP_PLAN_UNAVAILABLE');
    if (plan.clientCategories.length && !plan.clientCategories.includes(client.category)) {
      throw new DomainError('MEMBERSHIP_PLAN_UNAVAILABLE');
    }
    const method = await this.prisma.paymentMethod.findUnique({ where: { code: dto.methodCode.toUpperCase() } });
    if (!method || !method.isActive || !method.availableToClients) throw new DomainError('PAYMENT_METHOD_UNAVAILABLE');
    const provider = this.providers.get(method.provider);

    const pending = await this.prisma.payment.findFirst({
      where: { clientId, membershipPlanId: plan.id, status: 'PENDING', methodId: method.id },
      include: paymentInclude,
    });
    if (pending) return this.toDto(pending);

    const payment = await this.prisma.transaction(async (tx) => {
      const acceptance = await this.legal.recordAcceptance(tx, {
        userId,
        clientId,
        types: ['PUBLIC_OFFER'],
        context: 'PURCHASE',
      });
      return tx.payment.create({
        data: {
          clientId,
          amount: plan.price,
          productType: 'MEMBERSHIP',
          membershipPlanId: plan.id,
          description: `${plan.name} — ${plan.visits} visits, ${plan.validityDays} days`,
          methodId: method.id,
          provider: method.provider,
          termsAcceptanceId: acceptance.PUBLIC_OFFER ?? null,
          createdById: null,
        },
      });
    });

    const initiation = await provider.initiate(payment, method, { appUrl: this.config.appUrl });
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        checkoutUrl: initiation.checkoutUrl ?? null,
        providerPaymentId: initiation.providerPaymentId ?? null,
      },
      include: paymentInclude,
    });
    await this.prisma.clientActivity.create({
      data: { clientId, type: 'payment.created', title: `Payment started: ${plan.name} (${plan.price.toLocaleString('en-US')} KZT, ${method.name})`, actorId: userId },
    });
    await this.events.publish<PaymentCreatedEvent>(Events.PaymentCreated, {
      paymentId: payment.id,
      clientId,
      actor: { userId, source: 'CLIENT' },
    });
    return this.toDto(updated);
  }

  async cancelByClient(clientId: string, paymentId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, clientId } });
    if (!payment) throw notFound('Payment');
    if (payment.status !== 'PENDING' || payment.productType !== 'MEMBERSHIP') throw new DomainError('PAYMENT_INVALID_STATE');
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'CANCELLED', cancelledAt: this.clock.now(), failureReason: 'Cancelled by client' },
      include: paymentInclude,
    });
    return this.toDto(updated);
  }

  // ─── Admin payment requests (Kaspi invoice workflow) ───

  async createRequest(dto: CreatePaymentRequestDto, actor: AuthUser): Promise<AdminPaymentDto> {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw notFound('Client');
    const method = await this.prisma.paymentMethod.findUnique({ where: { code: dto.methodCode.toUpperCase() } });
    if (!method || !method.isActive) throw new DomainError('PAYMENT_METHOD_UNAVAILABLE');

    let amount = dto.amount;
    let description = dto.description ?? null;
    if (dto.productType === 'MEMBERSHIP') {
      if (!dto.planId) throw new DomainError('VALIDATION_FAILED', { message: 'Choose a membership plan.' });
      const plan = await this.prisma.membershipPlan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw notFound('Plan');
      amount ??= plan.price;
      description ??= `${plan.name} — ${plan.visits} visits, ${plan.validityDays} days`;
    } else if (dto.productType === 'TRIAL') {
      amount ??= (await this.settings.get('trial')).price;
      description ??= 'Trial session';
    }
    if (amount === undefined) throw new DomainError('VALIDATION_FAILED', { message: 'Enter an amount.' });

    const payment = await this.prisma.payment.create({
      data: {
        clientId: client.id,
        amount,
        productType: dto.productType,
        membershipPlanId: dto.productType === 'MEMBERSHIP' ? dto.planId : null,
        trialId: dto.trialId ?? null,
        description,
        methodId: method.id,
        provider: method.provider,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actor, action: 'payment.create', entityType: 'Payment', entityId: payment.id, newValue: payment });
    await this.prisma.clientActivity.create({
      data: {
        clientId: client.id,
        type: 'payment.created',
        title: `Payment request: ${description ?? dto.productType} — ${amount.toLocaleString('en-US')} KZT (${method.name})`,
        actorId: actor.id,
      },
    });
    await this.events.publish<PaymentCreatedEvent>(Events.PaymentCreated, {
      paymentId: payment.id,
      clientId: client.id,
      actor: { userId: actor.id, source: 'ADMIN' },
    });
    if (dto.markPaid) return this.confirm(payment.id, { reference: dto.reference }, actor);
    return this.getAdmin(payment.id);
  }

  /** Pending payment created inside another transaction (trial bookings). */
  async createPendingTx(
    tx: Tx,
    input: { clientId: string; amount: number; productType: 'TRIAL' | 'OTHER'; trialId?: string; description: string; createdById: string | null },
  ): Promise<Payment> {
    const method =
      (await tx.paymentMethod.findFirst({ where: { code: 'KASPI', isActive: true } })) ??
      (await tx.paymentMethod.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }));
    if (!method) throw new DomainError('PAYMENT_METHOD_UNAVAILABLE');
    return tx.payment.create({
      data: {
        clientId: input.clientId,
        amount: input.amount,
        productType: input.productType,
        trialId: input.trialId ?? null,
        description: input.description,
        methodId: method.id,
        provider: method.provider,
        createdById: input.createdById,
      },
    });
  }

  /**
   * Confirms a pending payment. For memberships this activates the membership in
   * the same transaction (start today, expiry today + validity, visits credited).
   */
  async confirm(paymentId: string, dto: ConfirmPaymentDto, actor: AuthUser | null, source: ActorRef['source'] = 'ADMIN'): Promise<AdminPaymentDto> {
    const { payment, membership } = await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'payments', [paymentId]);
      const current = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!current) throw notFound('Payment');
      if (current.status !== 'PENDING' && current.status !== 'FAILED') throw new DomainError('PAYMENT_INVALID_STATE');
      let methodId = current.methodId;
      let provider = current.provider;
      if (dto.methodCode) {
        const method = await tx.paymentMethod.findUnique({ where: { code: dto.methodCode.toUpperCase() } });
        if (!method) throw new DomainError('PAYMENT_METHOD_UNAVAILABLE');
        methodId = method.id;
        provider = method.provider;
      }
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : this.clock.now();
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paidAt,
          confirmedById: actor?.id ?? null,
          reference: dto.reference ?? current.reference,
          methodId,
          provider,
          notes: dto.notes ? [current.notes, dto.notes].filter(Boolean).join('\n') : current.notes,
          failureReason: null,
        },
      });
      let membership: Membership | null = null;
      if (updated.productType === 'MEMBERSHIP') {
        membership = await this.memberships.activateFromPayment(tx, updated, actor?.id ?? null);
      }
      await tx.clientActivity.create({
        data: {
          clientId: updated.clientId,
          type: 'payment.confirmed',
          title: `Payment confirmed: ${updated.amount.toLocaleString('en-US')} KZT${updated.description ? ` — ${updated.description}` : ''}`,
          actorId: actor?.id ?? null,
        },
      });
      if (actor) {
        await this.audit.log(
          {
            actor,
            action: 'payment.confirm',
            entityType: 'Payment',
            entityId: paymentId,
            oldValue: { status: current.status },
            newValue: { status: 'PAID', reference: updated.reference, membershipId: membership?.id ?? null },
          },
          tx,
        );
      }
      return { payment: updated, membership };
    });

    const actorRef: ActorRef = { userId: actor?.id ?? null, source };
    await this.events.publish<PaymentConfirmedEvent>(Events.PaymentConfirmed, {
      paymentId,
      clientId: payment.clientId,
      productType: payment.productType,
      amount: payment.amount,
      actor: actorRef,
    });
    if (membership) await this.memberships.publishActivated(membership, actorRef);
    return this.getAdmin(paymentId);
  }

  async cancel(paymentId: string, reason: string, actor: AuthUser): Promise<AdminPaymentDto> {
    await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'payments', [paymentId]);
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw notFound('Payment');
      if (payment.status !== 'PENDING' && payment.status !== 'FAILED') throw new DomainError('PAYMENT_INVALID_STATE');
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'CANCELLED', cancelledAt: this.clock.now(), failureReason: reason },
      });
      await this.audit.log(
        { actor, action: 'payment.cancel', entityType: 'Payment', entityId: paymentId, oldValue: { status: payment.status }, newValue: { status: 'CANCELLED' }, reason },
        tx,
      );
    });
    return this.getAdmin(paymentId);
  }

  async refund(paymentId: string, amount: number | undefined, reason: string, cancelMembership: boolean, actor: AuthUser): Promise<AdminPaymentDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { membership: true } });
    if (!payment) throw notFound('Payment');
    if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') throw new DomainError('PAYMENT_INVALID_STATE');
    const refundable = payment.amount - payment.refundedAmount;
    const value = amount ?? refundable;
    if (value <= 0 || value > refundable) throw new DomainError('PAYMENT_REFUND_EXCEEDS', { details: { refundable } });

    const provider = this.providers.find(payment.provider);
    if (provider?.refund && !provider.manual) await provider.refund(payment, value);

    await this.prisma.transaction(async (tx) => {
      await lockRows(tx, 'payments', [paymentId]);
      const refunded = payment.refundedAmount + value;
      const status: PaymentStatus = refunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await tx.payment.update({
        where: { id: paymentId },
        data: { refundedAmount: refunded, refundedAt: this.clock.now(), refundReason: reason, status },
      });
      await this.audit.log(
        {
          actor,
          action: 'payment.refund',
          entityType: 'Payment',
          entityId: paymentId,
          oldValue: { status: payment.status, refundedAmount: payment.refundedAmount },
          newValue: { status, refundedAmount: refunded },
          reason,
        },
        tx,
      );
      await tx.clientActivity.create({
        data: { clientId: payment.clientId, type: 'payment.refunded', title: `Refund ${value.toLocaleString('en-US')} KZT — ${reason}`, actorId: actor.id },
      });
    });
    if (cancelMembership && payment.membership && payment.membership.status !== 'CANCELLED') {
      await this.memberships.cancel(payment.membership.id, `Refund: ${reason}`, actor);
    }
    return this.getAdmin(paymentId);
  }

  /** Provider callback (online payments). Idempotent. */
  async handleWebhook(providerCode: string, body: unknown, headers: Record<string, string | undefined>): Promise<{ ok: true }> {
    const provider = this.providers.find(providerCode);
    if (!provider?.parseWebhook || !provider.isConfigured()) throw new DomainError('PAYMENT_WEBHOOK_INVALID');
    const result = await provider.parseWebhook(body, headers);
    if (!result) throw new DomainError('PAYMENT_WEBHOOK_INVALID');
    const payment = await this.prisma.payment.findFirst({
      where: { provider: providerCode, providerPaymentId: result.providerPaymentId },
    });
    if (!payment) throw new DomainError('PAYMENT_WEBHOOK_INVALID');
    if (payment.status === 'PAID') return { ok: true };
    if (result.status === 'PAID') {
      if (result.amount !== undefined && result.amount !== payment.amount) {
        this.logger.error(`Webhook amount mismatch for payment ${payment.id}: ${result.amount} ≠ ${payment.amount}`);
        throw new DomainError('PAYMENT_WEBHOOK_INVALID');
      }
      await this.confirm(payment.id, {}, null, 'SYSTEM');
    } else if (payment.status === 'PENDING') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: result.failureReason ?? 'Payment failed' },
      });
    }
    return { ok: true };
  }

  /** Development checkout: simulates the provider calling our webhook. */
  async completeMock(paymentId: string, clientId: string, result: 'success' | 'fail'): Promise<PaymentDto> {
    if (!this.config.payments.mockOnlineEnabled) throw new DomainError('NOT_FOUND');
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, clientId, provider: 'mock_online' } });
    if (!payment || !payment.providerPaymentId) throw notFound('Payment');
    await this.handleWebhook('mock_online', { providerPaymentId: payment.providerPaymentId, result }, {});
    return this.getForClient(clientId, paymentId);
  }

  // ─── Reads ───

  async listForClient(clientId: string): Promise<PaymentDto[]> {
    const rows = await this.prisma.payment.findMany({
      where: { clientId },
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toDto(r));
  }

  async getForClient(clientId: string, paymentId: string): Promise<PaymentDto> {
    const row = await this.prisma.payment.findFirst({ where: { id: paymentId, clientId }, include: paymentInclude });
    if (!row) throw notFound('Payment');
    return this.toDto(row);
  }

  async getAdmin(paymentId: string): Promise<AdminPaymentDto> {
    const row = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    if (!row) throw notFound('Payment');
    return this.toAdminDto(row);
  }

  async listAdmin(query: PaymentListQueryDto): Promise<AdminPaymentPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const phone = query.q ? normalizePhone(query.q) : null;
    const where: Prisma.PaymentWhereInput = {
      status: query.status,
      clientId: query.clientId,
      productType: query.productType,
      method: query.methodCode ? { code: query.methodCode.toUpperCase() } : undefined,
      createdAt:
        query.from || query.to
          ? { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? new Date(query.to) : undefined }
          : undefined,
      ...(query.q && {
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { client: { firstName: { contains: query.q, mode: 'insensitive' } } },
          { client: { lastName: { contains: query.q, mode: 'insensitive' } } },
          ...(phone ? [{ client: { phone } }] : []),
        ],
      }),
    };
    const [rows, total, paid, pending] = await Promise.all([
      this.prisma.payment.findMany({ where, include: paymentInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where: { AND: [where, { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }] },
        _sum: { amount: true, refundedAmount: true },
      }),
      this.prisma.payment.aggregate({ where: { AND: [where, { status: 'PENDING' }] }, _sum: { amount: true } }),
    ]);
    return {
      items: rows.map((r) => this.toAdminDto(r)),
      total,
      page,
      pageSize,
      totalPaid: (paid._sum.amount ?? 0) - (paid._sum.refundedAmount ?? 0),
      totalPending: pending._sum.amount ?? 0,
    };
  }

  // ─── Mapping ───

  toDto(row: PaymentRow): PaymentDto {
    return {
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      productType: row.productType,
      description: row.description,
      status: row.status,
      method: { code: row.method.code, name: row.method.name },
      provider: row.provider,
      reference: row.reference,
      checkoutUrl: row.status === 'PENDING' ? row.checkoutUrl : null,
      instructions: row.method.instructions,
      plan: row.plan ? { id: row.plan.id, name: row.plan.name, visits: row.plan.visits, validityDays: row.plan.validityDays } : null,
      trialId: row.trialId,
      membershipId: row.membership?.id ?? null,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
      cancelledAt: row.cancelledAt,
      failureReason: row.failureReason,
      refundedAmount: row.refundedAmount,
      refundedAt: row.refundedAt,
      refundReason: row.refundReason,
    };
  }

  toAdminDto(row: PaymentRow): AdminPaymentDto {
    return {
      ...this.toDto(row),
      checkoutUrl: row.checkoutUrl,
      client: { id: row.client.id, name: fullName(row.client.firstName, row.client.lastName), phone: row.client.phone },
      createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.displayName ?? 'Staff' } : null,
      confirmedBy: row.confirmedBy ? { id: row.confirmedBy.id, name: row.confirmedBy.displayName ?? 'Staff' } : null,
      notes: row.notes,
    };
  }
}
