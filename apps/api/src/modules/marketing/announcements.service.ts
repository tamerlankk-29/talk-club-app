import { Injectable } from '@nestjs/common';
import { Announcement, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { notFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SegmentsService } from '../segments/segments.service';
import { AnnouncementDto, CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/marketing.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  private liveWhere(): Prisma.AnnouncementWhereInput {
    const now = this.clock.now();
    return { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  }

  /** Announcements shown to a client (audience-filtered). */
  async forClient(clientId: string | null): Promise<AnnouncementDto[]> {
    const rows = await this.prisma.announcement.findMany({
      where: this.liveWhere(),
      orderBy: [{ isPinned: 'desc' }, { startsAt: 'desc' }],
      take: 20,
    });
    const visible: Announcement[] = [];
    for (const a of rows) {
      if (!a.audience) visible.push(a);
      else if (clientId && (await this.segments.matches(clientId, this.segments.parse(a.audience)))) visible.push(a);
    }
    return visible.map((a) => this.toDto(a));
  }

  async list(): Promise<AnnouncementDto[]> {
    const rows = await this.prisma.announcement.findMany({ orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }], take: 200 });
    return rows.map((a) => this.toDto(a));
  }

  async create(dto: CreateAnnouncementDto, actor: AuthUser): Promise<AnnouncementDto> {
    if (dto.audience) this.segments.parse(dto.audience);
    const a = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl ?? null,
        buttonLabel: dto.buttonLabel ?? null,
        buttonUrl: dto.buttonUrl ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : this.clock.now(),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        audience: dto.audience ? (dto.audience as Prisma.InputJsonValue) : Prisma.JsonNull,
        isPinned: dto.isPinned ?? false,
        isActive: dto.isActive ?? true,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actor, action: 'announcement.create', entityType: 'Announcement', entityId: a.id, newValue: dto });
    return this.toDto(a);
  }

  async update(id: string, dto: UpdateAnnouncementDto, actor: AuthUser): Promise<AnnouncementDto> {
    const before = await this.prisma.announcement.findUnique({ where: { id } });
    if (!before) throw notFound('Announcement');
    if (dto.audience) this.segments.parse(dto.audience);
    const a = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null,
        audience: dto.audience === undefined ? undefined : dto.audience ? (dto.audience as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    await this.audit.log({ actor, action: 'announcement.update', entityType: 'Announcement', entityId: id, oldValue: before, newValue: dto });
    return this.toDto(a);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.log({ actor, action: 'announcement.delete', entityType: 'Announcement', entityId: id });
  }

  private toDto(a: Announcement): AnnouncementDto {
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      buttonLabel: a.buttonLabel,
      buttonUrl: a.buttonUrl,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      audience: a.audience,
      isPinned: a.isPinned,
      isActive: a.isActive,
      createdAt: a.createdAt,
    };
  }
}
