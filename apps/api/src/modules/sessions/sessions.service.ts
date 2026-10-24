import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SessionTemplate } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { Events, SeatReleasedEvent, SessionUpdatedEvent } from '../../common/events/events';
import { requestLocale } from '../../common/request-context';
import { fullName } from '../../common/utils/names';
import { localClock, localDate, localToUtc, localWeekday } from '../../common/utils/time';
import { levelRangeLabel } from '../../domain/level-policy';
import { generateOccurrences } from '../../domain/recurrence';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateSessionDto,
  CreateSessionTemplateDto,
  DuplicateResultDto,
  DuplicateSessionDto,
  SessionAdminDto,
  SessionListQueryDto,
  SessionTemplateDto,
  SkippedOccurrenceDto,
  TemplateGenerationResultDto,
  UpdateSessionDto,
  UpdateSessionTemplateDto,
} from './dto/session.dto';
import { SessionReadService } from './session-read.service';

const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface SlotInput {
  id?: string;
  locationId: string;
  roomId: string | null;
  teacherId: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly read: SessionReadService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
  ) {}

  // ─── Queries ───

  async listAdmin(query: SessionListQueryDto): Promise<SessionAdminDto[]> {
    const where = await this.read.buildWhere(query, { defaultDays: 7 });
    const rows = await this.read.findMany(where);
    const ctx = await this.read.context(rows.map((r) => r.id));
    const dtos = rows.map((r) => this.read.toAdminDto(r, ctx));
    return (await this.read.applyMemoryFilters(dtos, query)) as SessionAdminDto[];
  }

  async getAdmin(id: string): Promise<SessionAdminDto> {
    const row = await this.read.findOne(id);
    if (!row) throw notFound('Session');
    const ctx = await this.read.context([id]);
    return this.read.toAdminDto(row, ctx);
  }

  // ─── Create / update ───

  async create(dto: CreateSessionDto, actor: AuthUser): Promise<SessionAdminDto> {
    const defaults = await this.settings.get('sessions');
    const programId = dto.programId ?? (await this.catalog.defaultProgram()).id;
    const locationId = dto.locationId ?? (await this.catalog.defaultLocation()).id;
    const tz = await this.catalog.timezoneFor(locationId);
    const startsAt = localToUtc(dto.date, dto.startTime, tz);
    const endsAt = new Date(startsAt.getTime() + (dto.durationMinutes ?? defaults.defaultDurationMinutes) * 60_000);
    const capacity = dto.capacity ?? defaults.defaultCapacity;
    const slot: SlotInput = {
      locationId,
      roomId: dto.roomId ?? null,
      teacherId: dto.teacherId ?? null,
      startsAt,
      endsAt,
      capacity,
    };
    await this.assertNoConflicts(this.prisma, slot);
    const session = await this.prisma.session.create({
      data: {
        programId,
        locationId,
        roomId: slot.roomId,
        teacherId: slot.teacherId,
        groupTypeId: dto.groupTypeId ?? null,
        levelMinId: dto.levelMinId ?? null,
        levelMaxId: dto.levelMaxId ?? null,
        title: dto.title ?? null,
        topic: dto.topic ?? null,
        description: dto.description ?? null,
        startsAt,
        endsAt,
        capacity,
        format: dto.format ?? 'OFFLINE',
        onlineUrl: dto.onlineUrl ?? null,
        bookingClosed: dto.bookingClosed ?? false,
        trialsAllowed: dto.trialsAllowed ?? true,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actor, action: 'session.create', entityType: 'Session', entityId: session.id, newValue: session });
    const row = await this.read.findOne(session.id);
    const ctx = await this.read.context([session.id]);
    return this.read.toAdminDto(row!, ctx, await this.warningsFor(slot));
  }

  async update(id: string, dto: UpdateSessionDto, actor: AuthUser): Promise<SessionAdminDto> {
    const before = await this.prisma.session.findUnique({ where: { id } });
    if (!before) throw notFound('Session');
    if (before.status === 'CANCELLED') throw new DomainError('SESSION_ALREADY_CANCELLED');

    const locationId = dto.locationId ?? before.locationId;
    const tz = await this.catalog.timezoneFor(locationId);
    const duration = dto.durationMinutes ?? Math.round((before.endsAt.getTime() - before.startsAt.getTime()) / 60_000);
    const date = dto.date ?? localDate(before.startsAt, tz);
    const time = dto.startTime ?? localClock(before.startsAt, tz);
    const startsAt = localToUtc(date, time, tz);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const capacity = dto.capacity ?? before.capacity;

    const booked = await this.prisma.booking.count({ where: { sessionId: id, activeSlot: true } });
    if (capacity < booked && !dto.force) {
      throw new DomainError('SESSION_CAPACITY_BELOW_BOOKED', { details: { booked } });
    }

    const slot: SlotInput = {
      id,
      locationId,
      roomId: dto.roomId !== undefined ? dto.roomId : before.roomId,
      teacherId: dto.teacherId !== undefined ? dto.teacherId : before.teacherId,
      startsAt,
      endsAt,
      capacity,
    };
    await this.assertNoConflicts(this.prisma, slot);

    const { force: _force, notifyClients, date: _date, startTime: _time, durationMinutes: _dur, ...rest } = dto;
    const updated = await this.prisma.session.update({
      where: { id },
      data: {
        ...rest,
        locationId,
        roomId: slot.roomId,
        teacherId: slot.teacherId,
        startsAt,
        endsAt,
        capacity,
        isDetached: before.templateId ? true : before.isDetached,
      },
    });

    const changes: SessionUpdatedEvent['changes'] = [];
    if (before.startsAt.getTime() !== startsAt.getTime() || before.endsAt.getTime() !== endsAt.getTime()) changes.push('time');
    if (before.teacherId !== updated.teacherId) changes.push('teacher');
    if (before.roomId !== updated.roomId) changes.push('room');
    if (before.format !== updated.format) changes.push('format');

    await this.audit.log({ actor, action: 'session.update', entityType: 'Session', entityId: id, oldValue: before, newValue: updated });
    if (changes.length) {
      await this.events.publish<SessionUpdatedEvent>(Events.SessionUpdated, {
        sessionId: id,
        changes,
        notifyClients: notifyClients !== false,
        actor: { userId: actor.id, source: 'ADMIN' },
      });
    }
    if (capacity > before.capacity || (before.bookingClosed && !updated.bookingClosed)) {
      await this.events.publish<SeatReleasedEvent>(Events.SeatReleased, { sessionId: id });
    }
    const row = await this.read.findOne(id);
    const ctx = await this.read.context([id]);
    return this.read.toAdminDto(row!, ctx, await this.warningsFor(slot));
  }

  async duplicate(id: string, dto: DuplicateSessionDto, actor: AuthUser): Promise<DuplicateResultDto> {
    const source = await this.prisma.session.findUnique({ where: { id } });
    if (!source) throw notFound('Session');
    const tz = await this.catalog.timezoneFor(source.locationId);
    const duration = Math.round((source.endsAt.getTime() - source.startsAt.getTime()) / 60_000);
    const created: SessionAdminDto[] = [];
    const skipped: SkippedOccurrenceDto[] = [];
    for (const date of [...new Set(dto.dates)].sort()) {
      try {
        created.push(
          await this.create(
            {
              programId: source.programId,
              locationId: source.locationId,
              roomId: source.roomId,
              teacherId: source.teacherId,
              groupTypeId: source.groupTypeId,
              levelMinId: source.levelMinId,
              levelMaxId: source.levelMaxId,
              title: source.title,
              topic: source.topic,
              description: source.description,
              date,
              startTime: dto.startTime ?? localClock(source.startsAt, tz),
              durationMinutes: duration,
              capacity: source.capacity,
              format: source.format,
              onlineUrl: source.onlineUrl,
              trialsAllowed: source.trialsAllowed,
            },
            actor,
          ),
        );
      } catch (error) {
        skipped.push({ date, reason: error instanceof DomainError ? error.message : 'Could not create session' });
      }
    }
    return { created, skipped };
  }

  // ─── Conflicts & warnings ───

  async assertNoConflicts(db: Db, slot: SlotInput): Promise<void> {
    if (slot.endsAt <= slot.startsAt) throw new DomainError('SESSION_INVALID_TIME');
    const overlap = { status: 'SCHEDULED' as const, startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt }, NOT: slot.id ? { id: slot.id } : undefined };
    if (slot.roomId) {
      const clash = await db.session.findFirst({ where: { ...overlap, roomId: slot.roomId }, select: { id: true, startsAt: true } });
      if (clash) throw new DomainError('SESSION_ROOM_CONFLICT', { details: { sessionId: clash.id, startsAt: clash.startsAt } });
    }
    if (slot.teacherId) {
      const clash = await db.session.findFirst({ where: { ...overlap, teacherId: slot.teacherId }, select: { id: true, startsAt: true } });
      if (clash) throw new DomainError('SESSION_TEACHER_CONFLICT', { details: { sessionId: clash.id, startsAt: clash.startsAt } });
    }
  }

  async warningsFor(slot: SlotInput): Promise<string[]> {
    const warnings: string[] = [];
    const location = await this.prisma.location.findUnique({ where: { id: slot.locationId } });
    if (location) {
      const tz = location.timezone;
      const weekday = localWeekday(slot.startsAt, tz);
      const hours = (location.workingHours as Record<string, { open: string; close: string } | null>)[String(weekday)];
      if (!hours) warnings.push(`The club is closed on ${WEEKDAYS[weekday]}s.`);
      else {
        const start = localClock(slot.startsAt, tz);
        const end = localClock(slot.endsAt, tz);
        if (start < hours.open || end > hours.close || localDate(slot.startsAt, tz) !== localDate(slot.endsAt, tz)) {
          warnings.push(`Outside working hours (${hours.open}–${hours.close}).`);
        }
      }
      if (slot.teacherId) {
        const teacher = await this.prisma.teacher.findUnique({ where: { id: slot.teacherId } });
        const availability = (teacher?.availability ?? []) as Array<{ day: number; from: string; to: string }>;
        if (teacher && availability.length) {
          const start = localClock(slot.startsAt, tz);
          const end = localClock(slot.endsAt, tz);
          const covered = availability.some((a) => a.day === weekday && a.from <= start && a.to >= end);
          if (!covered) warnings.push(`${teacher.firstName} is not marked as available at this time.`);
        }
        if (teacher && !teacher.isActive) warnings.push(`${teacher.firstName} is marked as inactive.`);
      }
    }
    if (slot.roomId) {
      const room = await this.prisma.room.findUnique({ where: { id: slot.roomId } });
      if (room && room.capacity < slot.capacity) warnings.push(`${room.name} fits ${room.capacity} people, capacity is ${slot.capacity}.`);
    }
    return warnings;
  }

  // ─── Recurring templates ───

  async listTemplates(): Promise<SessionTemplateDto[]> {
    const rows = await this.prisma.sessionTemplate.findMany({
      include: { teacher: true, room: true, levelMin: true, levelMax: true, groupType: true },
      orderBy: [{ isActive: 'desc' }, { startTime: 'asc' }],
    });
    const upcoming = await this.prisma.session.groupBy({
      by: ['templateId'],
      where: { templateId: { in: rows.map((r) => r.id) }, status: 'SCHEDULED', startsAt: { gte: this.clock.now() } },
      _count: { _all: true },
    });
    const counts = new Map(upcoming.map((u) => [u.templateId, u._count._all]));
    return rows.map((t) => this.toTemplateDto(t, counts.get(t.id) ?? 0));
  }

  async createTemplate(dto: CreateSessionTemplateDto, actor: AuthUser): Promise<TemplateGenerationResultDto> {
    const defaults = await this.settings.get('sessions');
    const programId = dto.programId ?? (await this.catalog.defaultProgram()).id;
    const locationId = dto.locationId ?? (await this.catalog.defaultLocation()).id;
    const tz = await this.catalog.timezoneFor(locationId);
    const template = await this.prisma.sessionTemplate.create({
      data: {
        programId,
        locationId,
        roomId: dto.roomId ?? null,
        teacherId: dto.teacherId ?? null,
        groupTypeId: dto.groupTypeId ?? null,
        levelMinId: dto.levelMinId ?? null,
        levelMaxId: dto.levelMaxId ?? null,
        title: dto.title ?? null,
        description: dto.description ?? null,
        daysOfWeek: [...new Set(dto.daysOfWeek)].sort(),
        startTime: dto.startTime,
        durationMinutes: dto.durationMinutes ?? defaults.defaultDurationMinutes,
        capacity: dto.capacity ?? defaults.defaultCapacity,
        format: dto.format ?? 'OFFLINE',
        onlineUrl: dto.onlineUrl ?? null,
        validFrom: dateOnly(dto.validFrom ?? localDate(this.clock.now(), tz)),
        validUntil: dto.validUntil ? dateOnly(dto.validUntil) : null,
        isActive: dto.isActive ?? true,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actor, action: 'template.create', entityType: 'SessionTemplate', entityId: template.id, newValue: template });
    const result = await this.generate(template.id, actor.id);
    return { ...result, updated: 0, removed: 0 };
  }

  async updateTemplate(id: string, dto: UpdateSessionTemplateDto, actor: AuthUser): Promise<TemplateGenerationResultDto> {
    const before = await this.prisma.sessionTemplate.findUnique({ where: { id } });
    if (!before) throw notFound('Template');
    const { applyToFuture = true, ...rest } = dto;
    const template = await this.prisma.sessionTemplate.update({
      where: { id },
      data: {
        ...rest,
        daysOfWeek: rest.daysOfWeek ? [...new Set(rest.daysOfWeek)].sort() : undefined,
        validFrom: rest.validFrom ? dateOnly(rest.validFrom) : undefined,
        validUntil: rest.validUntil === null ? null : rest.validUntil ? dateOnly(rest.validUntil) : undefined,
      },
    });
    await this.audit.log({ actor, action: 'template.update', entityType: 'SessionTemplate', entityId: id, oldValue: before, newValue: template });

    let updated = 0;
    let removed = 0;
    const skipped: SkippedOccurrenceDto[] = [];
    if (applyToFuture) {
      const tz = await this.catalog.timezoneFor(template.locationId);
      const timingChanged =
        before.startTime !== template.startTime ||
        before.durationMinutes !== template.durationMinutes ||
        before.daysOfWeek.join() !== template.daysOfWeek.join() ||
        before.validFrom.getTime() !== template.validFrom.getTime() ||
        (before.validUntil?.getTime() ?? 0) !== (template.validUntil?.getTime() ?? 0);
      const future = await this.prisma.session.findMany({
        where: { templateId: id, isDetached: false, status: 'SCHEDULED', startsAt: { gt: this.clock.now() } },
        include: { _count: { select: { bookings: { where: { activeSlot: true } } } } },
      });
      for (const session of future) {
        const date = localDate(session.startsAt, tz);
        if (timingChanged || !template.isActive) {
          if (session._count.bookings === 0) {
            await this.prisma.session.delete({ where: { id: session.id } });
            removed += 1;
          } else {
            skipped.push({ date, reason: `Kept at the old time because it has ${session._count.bookings} booking(s)` });
          }
          continue;
        }
        if (template.capacity < session._count.bookings) {
          skipped.push({ date, reason: 'New capacity is below the number of bookings' });
          continue;
        }
        try {
          await this.assertNoConflicts(this.prisma, {
            id: session.id,
            locationId: template.locationId,
            roomId: template.roomId,
            teacherId: template.teacherId,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            capacity: template.capacity,
          });
          await this.prisma.session.update({
            where: { id: session.id },
            data: {
              roomId: template.roomId,
              teacherId: template.teacherId,
              groupTypeId: template.groupTypeId,
              levelMinId: template.levelMinId,
              levelMaxId: template.levelMaxId,
              title: template.title,
              description: template.description,
              capacity: template.capacity,
              format: template.format,
              onlineUrl: template.onlineUrl,
            },
          });
          updated += 1;
        } catch (error) {
          skipped.push({ date, reason: error instanceof DomainError ? error.message : 'Update failed' });
        }
      }
      if (timingChanged) {
        await this.prisma.sessionTemplate.update({ where: { id }, data: { generatedUntil: null } });
      }
    }
    const generated = template.isActive ? await this.generate(id, actor.id) : { template: this.toTemplateDto(template, 0), created: 0, skipped: [] };
    return { template: generated.template, created: generated.created, updated, removed, skipped: [...skipped, ...generated.skipped] };
  }

  async deactivateTemplate(id: string, removeFuture: boolean, actor: AuthUser): Promise<TemplateGenerationResultDto> {
    const template = await this.prisma.sessionTemplate.findUnique({ where: { id } });
    if (!template) throw notFound('Template');
    await this.prisma.sessionTemplate.update({ where: { id }, data: { isActive: false } });
    let removed = 0;
    const skipped: SkippedOccurrenceDto[] = [];
    if (removeFuture) {
      const tz = await this.catalog.timezoneFor(template.locationId);
      const future = await this.prisma.session.findMany({
        where: { templateId: id, status: 'SCHEDULED', startsAt: { gt: this.clock.now() } },
        include: { _count: { select: { bookings: { where: { activeSlot: true } } } } },
      });
      for (const session of future) {
        if (session._count.bookings === 0) {
          await this.prisma.session.delete({ where: { id: session.id } });
          removed += 1;
        } else {
          skipped.push({ date: localDate(session.startsAt, tz), reason: `Has ${session._count.bookings} booking(s) — cancel it individually` });
        }
      }
    }
    await this.audit.log({ actor, action: 'template.deactivate', entityType: 'SessionTemplate', entityId: id, newValue: { removeFuture, removed } });
    const fresh = await this.prisma.sessionTemplate.findUniqueOrThrow({ where: { id } });
    return { template: this.toTemplateDto(fresh, 0), created: 0, updated: 0, removed, skipped };
  }

  /**
   * Materialises occurrences up to the configured horizon (weeks ahead).
   * Existing occurrences are skipped; room/teacher conflicts are reported.
   */
  async generate(templateId: string, actorId: string | null = null): Promise<{ template: SessionTemplateDto; created: number; skipped: SkippedOccurrenceDto[] }> {
    const template = await this.prisma.sessionTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('Template');
    const skipped: SkippedOccurrenceDto[] = [];
    let created = 0;
    if (template.isActive) {
      const tz = await this.catalog.timezoneFor(template.locationId);
      const weeks = (await this.settings.get('sessions')).generateWeeksAhead;
      const today = localDate(this.clock.now(), tz);
      const horizon = DateTime.fromISO(today, { zone: tz }).plus({ weeks }).toISODate() as string;
      const fromDate = today;
      const occurrences = generateOccurrences(
        {
          daysOfWeek: template.daysOfWeek,
          startTime: template.startTime,
          durationMinutes: template.durationMinutes,
          validFrom: isoDate(template.validFrom),
          validUntil: template.validUntil ? isoDate(template.validUntil) : null,
        },
        fromDate,
        horizon,
        tz,
      ).filter((o) => o.startsAt > this.clock.now());

      const existing = await this.prisma.session.findMany({
        where: { templateId, startsAt: { in: occurrences.map((o) => o.startsAt) } },
        select: { startsAt: true },
      });
      const existingTimes = new Set(existing.map((e) => e.startsAt.getTime()));
      for (const occurrence of occurrences) {
        if (existingTimes.has(occurrence.startsAt.getTime())) continue;
        try {
          await this.assertNoConflicts(this.prisma, {
            locationId: template.locationId,
            roomId: template.roomId,
            teacherId: template.teacherId,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            capacity: template.capacity,
          });
          await this.prisma.session.create({
            data: {
              programId: template.programId,
              locationId: template.locationId,
              roomId: template.roomId,
              teacherId: template.teacherId,
              groupTypeId: template.groupTypeId,
              levelMinId: template.levelMinId,
              levelMaxId: template.levelMaxId,
              title: template.title,
              description: template.description,
              startsAt: occurrence.startsAt,
              endsAt: occurrence.endsAt,
              capacity: template.capacity,
              format: template.format,
              onlineUrl: template.onlineUrl,
              templateId,
              createdById: actorId,
            },
          });
          created += 1;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
          skipped.push({
            date: occurrence.localDate,
            reason: error instanceof DomainError ? error.message : 'Conflicts with another session',
          });
        }
      }
      await this.prisma.sessionTemplate.update({ where: { id: templateId }, data: { generatedUntil: dateOnly(horizon) } });
    }
    const fresh = await this.prisma.sessionTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { teacher: true, room: true, levelMin: true, levelMax: true, groupType: true },
    });
    const upcoming = await this.prisma.session.count({ where: { templateId, status: 'SCHEDULED', startsAt: { gte: this.clock.now() } } });
    return { template: this.toTemplateDto(fresh, upcoming), created, skipped };
  }

  /** Background job: keep every active template generated up to the horizon. */
  async generateAll(): Promise<number> {
    const templates = await this.prisma.sessionTemplate.findMany({ where: { isActive: true }, select: { id: true } });
    let total = 0;
    for (const t of templates) {
      try {
        total += (await this.generate(t.id)).created;
      } catch (error) {
        this.logger.error(`Template ${t.id} generation failed: ${(error as Error).message}`);
      }
    }
    if (total) this.logger.log(`Generated ${total} session(s) from templates`);
    return total;
  }

  private toTemplateDto(
    t: SessionTemplate & {
      teacher?: { firstName: string; lastName: string | null } | null;
      room?: { name: string } | null;
      levelMin?: { name: string; rank: number } | null;
      levelMax?: { name: string; rank: number } | null;
      groupType?: { name: string } | null;
    },
    upcomingCount: number,
  ): SessionTemplateDto {
    return {
      id: t.id,
      programId: t.programId,
      locationId: t.locationId,
      roomId: t.roomId,
      teacherId: t.teacherId,
      groupTypeId: t.groupTypeId,
      levelMinId: t.levelMinId,
      levelMaxId: t.levelMaxId,
      title: t.title,
      description: t.description,
      daysOfWeek: t.daysOfWeek,
      startTime: t.startTime,
      durationMinutes: t.durationMinutes,
      capacity: t.capacity,
      format: t.format,
      onlineUrl: t.onlineUrl,
      validFrom: isoDate(t.validFrom),
      validUntil: t.validUntil ? isoDate(t.validUntil) : null,
      isActive: t.isActive,
      generatedUntil: t.generatedUntil ? isoDate(t.generatedUntil) : null,
      teacherName: t.teacher ? fullName(t.teacher.firstName, t.teacher.lastName) : null,
      roomName: t.room?.name ?? null,
      levelLabel: levelRangeLabel(t.levelMin ?? null, t.levelMax ?? null, requestLocale()),
      groupTypeName: t.groupType?.name ?? null,
      upcomingCount,
    };
  }
}

/** yyyy-MM-dd → Date at UTC midnight (for @db.Date columns). */
function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

