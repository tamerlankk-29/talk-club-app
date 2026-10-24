import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClockService } from '../../common/clock/clock.service';
import { fullName } from '../../common/utils/names';
import { localClock, localDate, localToUtc, localWeekday, zoned } from '../../common/utils/time';
import { cancellationDeadline, CancellationPolicy } from '../../domain/cancellation-policy';
import { levelRangeLabel } from '../../domain/level-policy';
import { computeSessionStatus, seatsAvailable } from '../../domain/session-status';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';
import { SessionAdminDto, SessionDto, SessionListQueryDto } from './dto/session.dto';

export const sessionInclude = {
  teacher: { select: { id: true, firstName: true, lastName: true, photoUrl: true, country: true, headline: true } },
  room: { select: { id: true, name: true, capacity: true } },
  location: { select: { id: true, name: true, address: true, addressDetails: true, timezone: true, workingHours: true } },
  groupType: { select: { id: true, name: true, color: true, clientCategories: true } },
  levelMin: { select: { id: true, name: true, rank: true } },
  levelMax: { select: { id: true, name: true, rank: true } },
  _count: {
    select: {
      bookings: { where: { activeSlot: true } },
      waitlist: { where: { activeSlot: true } },
    },
  },
} satisfies Prisma.SessionInclude;

export type SessionRow = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;

export interface SessionViewContext {
  policy: CancellationPolicy;
  openDaysAhead: number | null;
  almostFullThreshold: number;
  now: Date;
  /** Seats held by outstanding waitlist offers, by session id */
  held: Map<string, number>;
}

/** Longest date range one schedule query may cover. */
const MAX_RANGE_DAYS = 100;

/** Loads sessions and maps them to DTOs with computed status, seats and local times. */
@Injectable()
export class SessionReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly clock: ClockService,
  ) {}

  findMany(where: Prisma.SessionWhereInput, db: Db = this.prisma): Promise<SessionRow[]> {
    return db.session.findMany({ where, include: sessionInclude, orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }] });
  }

  findOne(id: string, db: Db = this.prisma): Promise<SessionRow | null> {
    return db.session.findUnique({ where: { id }, include: sessionInclude });
  }

  async context(sessionIds: string[], db: Db = this.prisma): Promise<SessionViewContext> {
    const [cancellation, booking, sessions] = await Promise.all([
      this.settings.get('cancellation'),
      this.settings.get('booking'),
      this.settings.get('sessions'),
    ]);
    const now = this.clock.now();
    const held = new Map<string, number>();
    if (sessionIds.length) {
      const offers = await db.waitlistEntry.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: sessionIds }, status: 'OFFERED', offerExpiresAt: { gt: now } },
        _count: { _all: true },
      });
      for (const o of offers) held.set(o.sessionId, o._count._all);
    }
    return {
      policy: cancellation,
      openDaysAhead: booking.openDaysAhead > 0 ? booking.openDaysAhead : null,
      almostFullThreshold: sessions.almostFullThreshold,
      now,
      held,
    };
  }

  toDto(row: SessionRow, ctx: SessionViewContext): SessionDto {
    const tz = row.location.timezone;
    const booked = row._count.bookings;
    const held = ctx.held.get(row.id) ?? 0;
    return {
      id: row.id,
      programId: row.programId,
      title: row.title ?? row.groupType?.name ?? 'Speaking Club',
      topic: row.topic,
      description: row.description,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      localDate: localDate(row.startsAt, tz),
      startTime: localClock(row.startsAt, tz),
      endTime: localClock(row.endsAt, tz),
      durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
      weekday: localWeekday(row.startsAt, tz),
      format: row.format,
      status: computeSessionStatus({
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        capacity: row.capacity,
        booked,
        held,
        bookingClosed: row.bookingClosed,
        openDaysAhead: ctx.openDaysAhead,
        almostFullThreshold: ctx.almostFullThreshold,
        now: ctx.now,
      }),
      bookingClosed: row.bookingClosed,
      capacity: row.capacity,
      booked,
      held,
      available: seatsAvailable(row.capacity, booked, held),
      waitlistCount: row._count.waitlist,
      teacher: row.teacher
        ? {
            id: row.teacher.id,
            name: fullName(row.teacher.firstName, row.teacher.lastName),
            photoUrl: row.teacher.photoUrl,
            country: row.teacher.country,
            headline: row.teacher.headline,
          }
        : null,
      room: row.room ? { id: row.room.id, name: row.room.name } : null,
      location: {
        id: row.location.id,
        name: row.location.name,
        address: row.location.address,
        addressDetails: row.location.addressDetails,
        timezone: tz,
      },
      groupType: row.groupType ? { id: row.groupType.id, name: row.groupType.name, color: row.groupType.color } : null,
      levelMin: row.levelMin,
      levelMax: row.levelMax,
      levelLabel: levelRangeLabel(row.levelMin, row.levelMax),
      trialsAllowed: row.trialsAllowed,
      cancellationDeadline: cancellationDeadline(row.startsAt, ctx.policy, tz),
      templateId: row.templateId,
    };
  }

  toAdminDto(row: SessionRow, ctx: SessionViewContext, warnings: string[] = []): SessionAdminDto {
    return {
      ...this.toDto(row, ctx),
      isDetached: row.isDetached,
      cancelReason: row.cancelReason,
      onlineUrl: row.onlineUrl,
      attendanceFinalizedAt: row.attendanceFinalizedAt,
      warnings,
    };
  }

  async toDtos(rows: SessionRow[], db: Db = this.prisma): Promise<SessionDto[]> {
    const ctx = await this.context(rows.map((r) => r.id), db);
    return rows.map((r) => this.toDto(r, ctx));
  }

  /** Builds the DB filter for a schedule query; time-of-day/weekday/level are applied in memory. */
  async buildWhere(query: SessionListQueryDto, opts: { defaultDays: number }): Promise<Prisma.SessionWhereInput> {
    const tz = await this.catalog.defaultTimezone();
    const now = this.clock.now();
    let from: Date;
    let to: Date;
    if (query.date) {
      from = localToUtc(query.date, '00:00', tz);
      to = zoned(from, tz).plus({ days: 1 }).toJSDate();
    } else {
      from = query.from ? new Date(query.from) : now;
      to = query.to ? new Date(query.to) : new Date(from.getTime() + opts.defaultDays * 86_400_000);
      // Bound the range so a single request can't scan the whole history.
      const maxTo = new Date(from.getTime() + MAX_RANGE_DAYS * 86_400_000);
      if (to > maxTo) to = maxTo;
    }
    return {
      startsAt: { gte: from, lt: to },
      ...(query.includeCancelled ? {} : { status: 'SCHEDULED' as const }),
      teacherId: query.teacherId,
      groupTypeId: query.groupTypeId,
      roomId: query.roomId,
      programId: query.programId,
      format: query.format,
    };
  }

  /** In-memory filters that depend on club-local time or level ranks. */
  async applyMemoryFilters(dtos: SessionDto[], query: SessionListQueryDto, levelRank?: number | null): Promise<SessionDto[]> {
    let result = dtos;
    if (query.weekday) result = result.filter((s) => s.weekday === query.weekday);
    if (query.timeOfDay) {
      result = result.filter((s) => {
        const hour = Number(s.startTime.slice(0, 2));
        if (query.timeOfDay === 'MORNING') return hour < 12;
        if (query.timeOfDay === 'AFTERNOON') return hour >= 12 && hour < 17;
        return hour >= 17;
      });
    }
    if (query.availableOnly) result = result.filter((s) => s.available > 0 && s.status !== 'COMPLETED' && s.status !== 'STARTED');
    const rank = query.levelId
      ? (await this.prisma.level.findUnique({ where: { id: query.levelId }, select: { rank: true } }))?.rank ?? null
      : levelRank ?? null;
    if (rank !== null && (query.levelId || query.matchMyLevel)) {
      result = result.filter(
        (s) => (!s.levelMin || s.levelMin.rank <= rank) && (!s.levelMax || s.levelMax.rank >= rank),
      );
    }
    return result;
  }
}
