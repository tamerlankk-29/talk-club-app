import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { normalizePhone } from '../../common/utils/phone';
import { localDate } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthContextService } from '../auth/auth-context.service';
import { CatalogService } from '../catalog/catalog.service';
import { PipelineService, STAGE_LABELS } from '../crm/pipeline.service';
import { MembershipsService } from '../memberships/memberships.service';
import { SegmentsService } from '../segments/segments.service';
import { SettingsService } from '../settings/settings.service';
import {
  ActivityDto,
  ClientDetailDto,
  ClientListItemDto,
  ClientListPageDto,
  ClientListQueryDto,
  ClientProfileDto,
  CreateClientDto,
  DataRequestDto,
  UpdateClientDto,
} from './dto/client.dto';

const profileInclude = {
  level: { select: { id: true, name: true, rank: true } },
  preferredTeachers: { include: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.ClientInclude;

export function toProfileDto(c: Prisma.ClientGetPayload<{ include: typeof profileInclude }>): ClientProfileDto {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: fullName(c.firstName, c.lastName),
    phone: c.phone,
    email: c.email,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    photoUrl: c.photoUrl,
    category: c.category,
    level: c.level,
    preferredDays: c.preferredDays,
    preferredTimes: c.preferredTimes,
    formatPreference: c.formatPreference,
    preferredTeachers: c.preferredTeachers.map((p) => ({ id: p.teacher.id, name: fullName(p.teacher.firstName, p.teacher.lastName) })),
    marketingConsent: c.marketingConsent,
    registeredAt: c.createdAt,
  };
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly segments: SegmentsService,
    private readonly pipeline: PipelineService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly authContext: AuthContextService,
    private readonly clock: ClockService,
  ) {}

  // ─── List & search ───

  async list(query: ClientListQueryDto): Promise<ClientListPageDto> {
    const now = this.clock.now();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const expiringDays = (await this.settings.get('crm')).expiringSoonDays;
    const active: Prisma.MembershipWhereInput = { status: 'ACTIVE', expiresAt: { gt: now } };
    const and: Prisma.ClientWhereInput[] = [{ status: query.status ?? { not: 'ANONYMIZED' } }];
    if (query.q) and.push(this.searchWhere(query.q));
    if (query.category) and.push({ category: query.category });
    if (query.levelId) and.push({ levelId: query.levelId });
    if (query.tagId) and.push({ tags: { some: { tagId: query.tagId } } });
    if (query.segmentId) and.push(await this.segments.where(await this.segments.definitionOf(query.segmentId)));
    if (query.membership === 'active') and.push({ memberships: { some: active } });
    if (query.membership === 'expiring') {
      and.push({ memberships: { some: { status: 'ACTIVE', expiresAt: { gt: now, lte: new Date(now.getTime() + expiringDays * 86_400_000) } } } });
    }
    if (query.membership === 'expired') and.push({ memberships: { some: {} } }, { memberships: { none: active } });
    if (query.membership === 'none') and.push({ memberships: { none: {} } });

    const orderBy: Prisma.ClientOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ firstName: 'asc' }, { lastName: 'asc' }]
        : query.sort === 'lastVisitAt'
          ? [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }]
          : [{ createdAt: 'desc' }];
    const where: Prisma.ClientWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          level: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
          lead: { select: { stage: true } },
          source: { select: { id: true, name: true } },
          memberships: { where: active, orderBy: { expiresAt: 'asc' }, take: 1 },
          bookings: {
            where: { status: 'BOOKED', session: { startsAt: { gt: now } } },
            orderBy: { session: { startsAt: 'asc' } },
            take: 1,
            include: { session: { include: { teacher: { select: { firstName: true, lastName: true } }, groupType: { select: { name: true } } } } },
          },
          _count: { select: { bookings: { where: { status: 'ATTENDED' } } } },
        },
      }),
      this.prisma.client.count({ where }),
    ]);
    const tz = await this.catalog.defaultTimezone();
    return {
      items: rows.map((c): ClientListItemDto => {
        const m = c.memberships[0];
        const next = c.bookings[0];
        return {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: fullName(c.firstName, c.lastName),
          phone: c.phone,
          email: c.email,
          photoUrl: c.photoUrl,
          category: c.category,
          level: c.level,
          status: c.status,
          hasAccount: !!c.userId,
          membership: m
            ? {
                id: m.id,
                planName: m.planName,
                visitsRemaining: m.visitsRemaining,
                visitsTotal: m.visitsTotal,
                expiresAt: m.expiresAt,
                expiresOn: localDate(m.expiresAt, tz),
                status: m.visitsRemaining > 0 ? 'ACTIVE' : 'USED_UP',
              }
            : null,
          lastVisitAt: c.lastVisitAt,
          nextBooking: next
            ? {
                id: next.id,
                startsAt: next.session.startsAt,
                title: next.session.title ?? next.session.groupType?.name ?? 'Speaking Club',
                teacherName: next.session.teacher ? fullName(next.session.teacher.firstName, next.session.teacher.lastName) : null,
              }
            : null,
          totalVisits: c._count.bookings,
          tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
          leadStage: c.lead?.stage ?? null,
          source: c.source,
          createdAt: c.createdAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  searchWhere(q: string): Prisma.ClientWhereInput {
    const term = q.trim();
    const phone = normalizePhone(term);
    const digits = term.replace(/\D/g, '');
    const parts = term.split(/\s+/).filter(Boolean);
    return {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        ...(parts.length > 1
          ? [{ AND: [{ firstName: { contains: parts[0], mode: 'insensitive' as const } }, { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' as const } }] }]
          : []),
        ...(phone ? [{ phone }] : []),
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    };
  }

  // ─── 360° profile ───

  async detail(id: string): Promise<ClientDetailDto> {
    const now = this.clock.now();
    const c = await this.prisma.client.findUnique({
      where: { id },
      include: {
        ...profileInclude,
        user: { select: { id: true, lastLoginAt: true, phoneVerifiedAt: true, passwordHash: true } },
        lead: { include: { source: { select: { name: true } } } },
        tags: { include: { tag: true } },
        guardians: { include: { guardian: { select: { id: true, displayName: true, phone: true } } } },
        referralCode: true,
        referredBy: { include: { referrer: { select: { id: true, firstName: true, lastName: true } } } },
        _count: { select: { referralsMade: true, tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } } },
      },
    });
    if (!c) throw notFound('Client');
    const [memberships, upcoming, recent, payments, trials, consents, children] = await Promise.all([
      this.prisma.membership.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.booking.findMany({
        where: { clientId: id, status: 'BOOKED', session: { startsAt: { gt: now } } },
        include: { session: { include: { teacher: true, groupType: true } } },
        orderBy: { session: { startsAt: 'asc' } },
        take: 10,
      }),
      this.prisma.booking.findMany({
        where: { clientId: id, OR: [{ status: { not: 'BOOKED' } }, { session: { startsAt: { lte: now } } }] },
        include: { session: { include: { teacher: true, groupType: true } } },
        orderBy: { session: { startsAt: 'desc' } },
        take: 30,
      }),
      this.prisma.payment.findMany({ where: { clientId: id }, include: { method: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.trial.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.agreementAcceptance.findMany({ where: { clientId: id }, orderBy: { acceptedAt: 'desc' } }),
      c.userId
        ? this.prisma.clientGuardian.findMany({ where: { guardianUserId: c.userId }, include: { client: { select: { id: true, firstName: true, lastName: true } } } })
        : Promise.resolve([]),
    ]);
    const membershipDtos = await this.memberships.toDtos(memberships);
    const current = membershipDtos
      .filter((m) => m.status === 'ACTIVE' || m.status === 'USED_UP')
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0] ?? null;
    const sessionTitle = (s: { title: string | null; groupType: { name: string } | null }) => s.title ?? s.groupType?.name ?? 'Speaking Club';
    return {
      profile: toProfileDto(c),
      status: c.status,
      notes: c.notes,
      account: c.user
        ? { hasAccount: true, lastLoginAt: c.user.lastLoginAt, phoneVerified: !!c.user.phoneVerifiedAt, hasPassword: !!c.user.passwordHash }
        : null,
      lead: c.lead ? { id: c.lead.id, stage: c.lead.stage, stageLabel: STAGE_LABELS[c.lead.stage], source: c.lead.source?.name ?? null } : null,
      tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      memberships: membershipDtos,
      currentMembership: current,
      upcomingBookings: upcoming.map((b) => ({
        id: b.id,
        sessionId: b.sessionId,
        startsAt: b.session.startsAt,
        title: sessionTitle(b.session),
        teacherName: b.session.teacher ? fullName(b.session.teacher.firstName, b.session.teacher.lastName) : null,
        kind: b.kind,
      })),
      recentBookings: recent.map((b) => ({
        id: b.id,
        sessionId: b.sessionId,
        startsAt: b.session.startsAt,
        title: sessionTitle(b.session),
        teacherName: b.session.teacher ? fullName(b.session.teacher.firstName, b.session.teacher.lastName) : null,
        status: b.status,
        visitReturned: b.visitReturned,
        kind: b.kind,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        description: p.description,
        method: p.method.name,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
      })),
      trials: trials.map((t) => ({ id: t.id, status: t.status, outcome: t.outcome, createdAt: t.createdAt })),
      openTasks: c._count.tasks,
      guardians: c.guardians.map((g) => ({ userId: g.guardian.id, name: g.guardian.displayName ?? 'Parent', phone: g.guardian.phone, relationship: g.relationship })),
      children: children.map((ch) => ({ id: ch.client.id, name: fullName(ch.client.firstName, ch.client.lastName) })),
      referral: {
        code: c.referralCode?.code ?? null,
        referredBy: c.referredBy ? { id: c.referredBy.referrer.id, name: fullName(c.referredBy.referrer.firstName, c.referredBy.referrer.lastName) } : null,
        referralsMade: c._count.referralsMade,
      },
      consents: consents.map((a) => ({ documentType: a.documentType, version: a.documentVersion, acceptedAt: a.acceptedAt, context: a.context })),
      deletionRequestedAt: c.deletionRequestedAt,
    };
  }

  async timeline(clientId: string, before?: string, limit = 50): Promise<ActivityDto[]> {
    const rows = await this.prisma.clientActivity.findMany({
      where: { clientId, createdAt: before ? { lt: new Date(before) } : undefined },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }) : [];
    const labels = new Map(actors.map((a) => [a.id, a.displayName]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      data: r.data,
      actorLabel: r.actorId ? (labels.get(r.actorId) ?? null) : 'System',
      createdAt: r.createdAt,
    }));
  }

  // ─── Create / update ───

  async create(dto: CreateClientDto, actor: AuthUser): Promise<ClientDetailDto> {
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone) throw new DomainError('AUTH_PHONE_INVALID');
    if (phone && (await this.prisma.client.findUnique({ where: { phone } }))) {
      throw new DomainError('CONFLICT', { message: 'A client with this phone number already exists.' });
    }
    const client = await this.prisma.client.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        phone,
        email: dto.email?.toLowerCase() ?? null,
        birthDate: dto.birthDate ? new Date(`${dto.birthDate}T00:00:00Z`) : null,
        category: dto.category,
        levelId: dto.levelId,
        preferredDays: dto.preferredDays ?? [],
        preferredTimes: dto.preferredTimes ?? [],
        formatPreference: dto.formatPreference,
        sourceId: dto.sourceId,
        notes: dto.notes,
        marketingConsent: dto.marketingConsent ?? false,
        marketingConsentAt: dto.marketingConsent ? this.clock.now() : null,
      },
    });
    if (dto.levelId) await this.prisma.clientLevel.create({ data: { clientId: client.id, levelId: dto.levelId, reason: 'Set by admin', changedById: actor.id } });
    await this.prisma.clientActivity.create({ data: { clientId: client.id, type: 'client.created', title: 'Client created by the club', actorId: actor.id } });
    await this.pipeline.ensureLead(client.id);
    await this.audit.log({ actor, action: 'client.create', entityType: 'Client', entityId: client.id, newValue: dto });
    return this.detail(client.id);
  }

  async update(id: string, dto: UpdateClientDto, actor: AuthUser): Promise<ClientDetailDto> {
    const before = await this.prisma.client.findUnique({ where: { id } });
    if (!before) throw notFound('Client');
    if (before.status === 'ANONYMIZED') throw new DomainError('CONFLICT', { message: 'This client was anonymized.' });
    const phone = dto.phone !== undefined ? (dto.phone ? normalizePhone(dto.phone) : null) : undefined;
    if (dto.phone && !phone) throw new DomainError('AUTH_PHONE_INVALID');
    if (phone && phone !== before.phone && (await this.prisma.client.findUnique({ where: { phone } }))) {
      throw new DomainError('CONFLICT', { message: 'Another client already has this phone number.' });
    }
    const { levelReason, ...fields } = dto;
    await this.prisma.transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          ...fields,
          phone,
          email: dto.email?.toLowerCase(),
          birthDate: dto.birthDate === undefined ? undefined : dto.birthDate ? new Date(`${dto.birthDate}T00:00:00Z`) : null,
          marketingConsentAt: dto.marketingConsent !== undefined && dto.marketingConsent !== before.marketingConsent ? this.clock.now() : undefined,
        },
      });
      if (dto.levelId && dto.levelId !== before.levelId) {
        const level = await tx.level.findUniqueOrThrow({ where: { id: dto.levelId } });
        await tx.clientLevel.create({ data: { clientId: id, levelId: dto.levelId, reason: levelReason ?? 'Changed by admin', changedById: actor.id } });
        await tx.clientActivity.create({ data: { clientId: id, type: 'client.level', title: `Level changed to ${level.name}`, actorId: actor.id } });
      }
      if (before.userId && (dto.firstName || dto.lastName)) {
        await tx.user.update({
          where: { id: before.userId },
          data: { displayName: fullName(dto.firstName ?? before.firstName, dto.lastName ?? before.lastName) },
        });
      }
      await this.audit.log({ actor, action: 'client.update', entityType: 'Client', entityId: id, oldValue: before, newValue: dto }, tx);
    });
    if (before.userId) this.authContext.invalidateUser(before.userId);
    return this.detail(id);
  }

  async addNote(id: string, text: string, actor: AuthUser): Promise<ActivityDto[]> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw notFound('Client');
    await this.prisma.clientActivity.create({ data: { clientId: id, type: 'note', title: text, actorId: actor.id } });
    return this.timeline(id);
  }

  async setArchived(id: string, archived: boolean, actor: AuthUser): Promise<ClientDetailDto> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw notFound('Client');
    if (client.status === 'ANONYMIZED') throw new DomainError('CONFLICT', { message: 'This client was anonymized.' });
    await this.prisma.client.update({ where: { id }, data: { status: archived ? 'ARCHIVED' : 'ACTIVE' } });
    await this.audit.log({ actor, action: archived ? 'client.archive' : 'client.unarchive', entityType: 'Client', entityId: id });
    return this.detail(id);
  }

  /**
   * GDPR-style deletion: removes personal data but keeps anonymous accounting
   * records (bookings, payments, ledger) that the club must retain.
   */
  async anonymize(id: string, reason: string, actor: AuthUser): Promise<void> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw notFound('Client');
    const upcoming = await this.prisma.booking.count({ where: { clientId: id, status: 'BOOKED', session: { startsAt: { gt: this.clock.now() } } } });
    if (upcoming) throw new DomainError('CONFLICT', { message: `Cancel the client's ${upcoming} upcoming booking(s) first.` });
    await this.prisma.transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          firstName: 'Deleted',
          lastName: 'client',
          phone: null,
          email: null,
          birthDate: null,
          photoUrl: null,
          notes: null,
          preferredDays: [],
          preferredTimes: [],
          marketingConsent: false,
          status: 'ANONYMIZED',
          userId: null,
        },
      });
      await tx.clientTag.deleteMany({ where: { clientId: id } });
      await tx.clientPreferredTeacher.deleteMany({ where: { clientId: id } });
      await tx.communication.deleteMany({ where: { clientId: id } });
      await tx.notification.deleteMany({ where: { clientId: id } });
      await tx.lead.updateMany({ where: { clientId: id }, data: { name: 'Deleted client', phone: null, email: null, notes: null, stage: 'LOST' } });
      await tx.trial.updateMany({ where: { clientId: id }, data: { name: 'Deleted client', phone: '', comment: null, notes: null } });
      if (client.userId) {
        await tx.user.update({
          where: { id: client.userId },
          data: { status: 'DELETED', phone: null, email: null, passwordHash: null, displayName: null, deletedAt: this.clock.now() },
        });
        await tx.authSession.updateMany({ where: { userId: client.userId, revokedAt: null }, data: { revokedAt: this.clock.now() } });
        await tx.pushSubscription.deleteMany({ where: { userId: client.userId } });
        await tx.dataRequest.updateMany({
          where: { userId: client.userId, type: 'DELETION', status: 'PENDING' },
          data: { status: 'COMPLETED', processedById: actor.id, processedAt: this.clock.now() },
        });
      }
      await this.audit.log({ actor, action: 'client.anonymize', entityType: 'Client', entityId: id, reason }, tx);
    });
    if (client.userId) this.authContext.invalidateUser(client.userId);
  }

  async linkGuardian(clientId: string, guardianPhone: string, relationship: string | undefined, actor: AuthUser): Promise<ClientDetailDto> {
    const phone = normalizePhone(guardianPhone);
    if (!phone) throw new DomainError('AUTH_PHONE_INVALID');
    const guardian = await this.prisma.user.findUnique({ where: { phone } });
    if (!guardian) throw new DomainError('NOT_FOUND', { message: 'No Talk Club account with this phone number.' });
    await this.prisma.clientGuardian.upsert({
      where: { guardianUserId_clientId: { guardianUserId: guardian.id, clientId } },
      create: { guardianUserId: guardian.id, clientId, relationship },
      update: { relationship },
    });
    this.authContext.invalidateUser(guardian.id);
    await this.audit.log({ actor, action: 'client.guardian', entityType: 'Client', entityId: clientId, newValue: { guardianUserId: guardian.id } });
    return this.detail(clientId);
  }

  async dataRequests(status?: 'PENDING' | 'COMPLETED' | 'REJECTED'): Promise<DataRequestDto[]> {
    const rows = await this.prisma.dataRequest.findMany({
      where: status ? { status } : undefined,
      include: { user: { select: { displayName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const clientIds = rows.map((r) => r.clientId).filter((id): id is string => !!id);
    const clients = await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, firstName: true, lastName: true } });
    const names = new Map(clients.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(' ')]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      reason: r.reason,
      clientId: r.clientId,
      clientName: r.clientId ? (names.get(r.clientId) ?? null) : null,
      user: { displayName: r.user.displayName, phone: r.user.phone },
      createdAt: r.createdAt,
      processedAt: r.processedAt,
    }));
  }

  /** Declines a data request (e.g. outstanding obligations); the reason goes to the audit log. */
  async rejectDataRequest(id: string, reason: string, actor: AuthUser): Promise<void> {
    const request = await this.prisma.dataRequest.findUnique({ where: { id } });
    if (!request) throw notFound('Data request');
    if (request.status !== 'PENDING') throw new DomainError('CONFLICT', { message: 'This request was already processed.' });
    await this.prisma.dataRequest.update({ where: { id }, data: { status: 'REJECTED', processedById: actor.id, processedAt: this.clock.now() } });
    await this.audit.log({ actor, action: 'dataRequest.reject', entityType: 'DataRequest', entityId: id, reason });
  }
}
