import { Injectable, Logger } from '@nestjs/common';
import { Broadcast, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SegmentDefinition } from '../segments/segment-rules';
import { SegmentsService } from '../segments/segments.service';
import { AudiencePreviewDto, BroadcastDto, CreateBroadcastDto, UpdateBroadcastDto } from './dto/marketing.dto';

/**
 * Marketing and service broadcasts to a segment. Marketing broadcasts only
 * reach clients who gave marketing consent; service messages (closures,
 * schedule changes) reach the whole audience. Scheduled broadcasts are sent by
 * a background job at their time.
 */
@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  private async audienceOf(input: { segmentId?: string | null; audience?: unknown }): Promise<SegmentDefinition> {
    if (input.segmentId) return this.segments.definitionOf(input.segmentId);
    return this.segments.parse(input.audience ?? { match: 'all', rules: [] });
  }

  async previewAudience(dto: AudiencePreviewDto): Promise<{ total: number; reachable: number }> {
    const definition = await this.audienceOf(dto);
    const total = await this.segments.count(definition);
    const reachable =
      (dto.kind ?? 'MARKETING') === 'MARKETING'
        ? (await this.segments.clientIds(definition, { marketingConsent: true })).length
        : total;
    return { total, reachable };
  }

  async list(): Promise<BroadcastDto[]> {
    const rows = await this.prisma.broadcast.findMany({ include: { segment: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    return Promise.all(rows.map((b) => this.toDto(b)));
  }

  async get(id: string): Promise<BroadcastDto> {
    const b = await this.prisma.broadcast.findUnique({ where: { id }, include: { segment: true } });
    if (!b) throw notFound('Broadcast');
    return this.toDto(b);
  }

  async create(dto: CreateBroadcastDto, actor: AuthUser): Promise<BroadcastDto> {
    await this.audienceOf(dto); // validates
    const b = await this.prisma.broadcast.create({
      data: {
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl ?? null,
        buttonLabel: dto.buttonLabel ?? null,
        buttonUrl: dto.buttonUrl ?? null,
        kind: dto.kind ?? 'MARKETING',
        channels: dto.channels,
        segmentId: dto.segmentId ?? null,
        audience: dto.segmentId ? Prisma.JsonNull : ((dto.audience ?? { match: 'all', rules: [] }) as Prisma.InputJsonValue),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        createdById: actor.id,
      },
    });
    await this.audit.log({ actor, action: 'broadcast.create', entityType: 'Broadcast', entityId: b.id, newValue: dto });
    return this.get(b.id);
  }

  async update(id: string, dto: UpdateBroadcastDto, actor: AuthUser): Promise<BroadcastDto> {
    const before = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!before) throw notFound('Broadcast');
    if (before.status !== 'DRAFT' && before.status !== 'SCHEDULED') throw new DomainError('CONFLICT', { message: 'Sent broadcasts cannot be edited.' });
    if (dto.segmentId !== undefined || dto.audience !== undefined) await this.audienceOf({ segmentId: dto.segmentId, audience: dto.audience });
    await this.prisma.broadcast.update({
      where: { id },
      data: {
        ...dto,
        audience: dto.audience === undefined ? undefined : dto.audience === null ? Prisma.JsonNull : (dto.audience as Prisma.InputJsonValue),
        scheduledAt: dto.scheduledAt === undefined ? undefined : dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt === undefined ? undefined : dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      },
    });
    await this.audit.log({ actor, action: 'broadcast.update', entityType: 'Broadcast', entityId: id, oldValue: before, newValue: dto });
    return this.get(id);
  }

  async schedule(id: string, scheduledAt: string, actor: AuthUser): Promise<BroadcastDto> {
    return this.update(id, { scheduledAt }, actor);
  }

  async cancel(id: string, actor: AuthUser): Promise<BroadcastDto> {
    const b = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!b) throw notFound('Broadcast');
    if (b.status !== 'DRAFT' && b.status !== 'SCHEDULED') throw new DomainError('CONFLICT', { message: 'This broadcast was already sent.' });
    await this.prisma.broadcast.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actor, action: 'broadcast.cancel', entityType: 'Broadcast', entityId: id });
    return this.get(id);
  }

  async sendNow(id: string, actor: AuthUser): Promise<BroadcastDto> {
    const b = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!b) throw notFound('Broadcast');
    if (b.status !== 'DRAFT' && b.status !== 'SCHEDULED') throw new DomainError('CONFLICT', { message: 'This broadcast was already sent.' });
    await this.audit.log({ actor, action: 'broadcast.send', entityType: 'Broadcast', entityId: id });
    await this.deliver(id);
    return this.get(id);
  }

  /** Background job: send scheduled broadcasts whose time has come. */
  async dispatchDue(): Promise<number> {
    const due = await this.prisma.broadcast.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: this.clock.now() } },
      select: { id: true },
    });
    for (const b of due) await this.deliver(b.id);
    return due.length;
  }

  private async deliver(id: string): Promise<void> {
    const claimed = await this.prisma.broadcast.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: { status: 'SENDING' },
    });
    if (claimed.count !== 1) return;
    const b = await this.prisma.broadcast.findUniqueOrThrow({ where: { id } });
    try {
      const definition = await this.audienceOf({ segmentId: b.segmentId, audience: b.audience });
      const clientIds = await this.segments.clientIds(definition, b.kind === 'MARKETING' ? { marketingConsent: true } : {});
      let sent = 0;
      for (const clientId of clientIds) {
        const notificationIds = await this.notifications.notifyClient(clientId, {
          content: { title: b.title, body: b.body, imageUrl: b.imageUrl, buttonLabel: b.buttonLabel, buttonUrl: b.buttonUrl },
          category: b.kind === 'MARKETING' ? 'MARKETING' : 'TRANSACTIONAL',
          channels: b.channels,
          broadcastId: b.id,
        });
        await this.prisma.broadcastRecipient.upsert({
          where: { broadcastId_clientId: { broadcastId: b.id, clientId } },
          create: { broadcastId: b.id, clientId, notificationId: notificationIds[0] ?? null, status: notificationIds.length ? 'SENT' : 'SKIPPED' },
          update: {},
        });
        if (notificationIds.length) sent += 1;
      }
      await this.prisma.broadcast.update({
        where: { id },
        data: { status: 'SENT', sentAt: this.clock.now(), recipientCount: sent },
      });
      this.logger.log(`Broadcast "${b.title}" sent to ${sent} client(s)`);
    } catch (error) {
      this.logger.error(`Broadcast ${id} failed: ${(error as Error).message}`);
      await this.prisma.broadcast.update({ where: { id }, data: { status: 'FAILED' } });
    }
  }

  private async toDto(b: Broadcast & { segment: { name: string } | null }): Promise<BroadcastDto> {
    const [statusCounts, read] = await Promise.all([
      this.prisma.broadcastRecipient.groupBy({ by: ['status'], where: { broadcastId: b.id }, _count: { _all: true } }),
      this.prisma.notification.count({ where: { broadcastId: b.id, readAt: { not: null } } }),
    ]);
    const count = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
    return {
      id: b.id,
      title: b.title,
      body: b.body,
      imageUrl: b.imageUrl,
      buttonLabel: b.buttonLabel,
      buttonUrl: b.buttonUrl,
      kind: b.kind,
      channels: b.channels,
      segmentId: b.segmentId,
      segmentName: b.segment?.name ?? null,
      audience: b.audience,
      scheduledAt: b.scheduledAt,
      status: b.status,
      sentAt: b.sentAt,
      recipientCount: b.recipientCount,
      stats: { sent: count('SENT'), skipped: count('SKIPPED'), failed: count('FAILED'), read },
      createdAt: b.createdAt,
    };
  }
}

