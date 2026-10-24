import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SegmentDefinition, segmentDefinitionSchema, SegmentRule, SYSTEM_SEGMENTS } from './segment-rules';
import { SegmentDto, SegmentPreviewDto } from './dto/segments-responses.dto';

const DAY = 86_400_000;

export interface SegmentPreviewClient {
  id: string;
  name: string;
  phone: string | null;
  category: string;
  lastVisitAt: Date | null;
}

@Injectable()
export class SegmentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SegmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureSystemSegments();
    } catch (error) {
      this.logger.error(`Could not seed system segments: ${(error as Error).message}`);
    }
  }

  parse(raw: unknown): SegmentDefinition {
    const parsed = segmentDefinitionSchema.safeParse(raw ?? { match: 'all', rules: [] });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', {
        message: 'The audience rules are invalid.',
        details: { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      });
    }
    return parsed.data;
  }

  /** Translates a definition into a Prisma filter over clients. */
  async where(definition: SegmentDefinition, db: Db = this.prisma): Promise<Prisma.ClientWhereInput> {
    const now = this.clock.now();
    const fragments: Prisma.ClientWhereInput[] = [];
    for (const rule of definition.rules) fragments.push(await this.fragment(rule, now, db));
    const base: Prisma.ClientWhereInput = { status: 'ACTIVE' };
    if (!fragments.length) return base;
    return { AND: [base, definition.match === 'any' ? { OR: fragments } : { AND: fragments }] };
  }

  private async fragment(rule: SegmentRule, now: Date, db: Db): Promise<Prisma.ClientWhereInput> {
    const activeMembership: Prisma.MembershipWhereInput = { status: 'ACTIVE', startsAt: { lte: now }, expiresAt: { gt: now } };
    switch (rule.field) {
      case 'membershipStatus':
        if (rule.value === 'ACTIVE') return { memberships: { some: activeMembership } };
        if (rule.value === 'NONE') return { memberships: { none: {} } };
        return { AND: [{ memberships: { some: { status: { not: 'CANCELLED' } } } }, { memberships: { none: activeMembership } }] };
      case 'hasActiveMembership':
        return rule.value ? { memberships: { some: activeMembership } } : { memberships: { none: activeMembership } };
      case 'membershipExpiresInDays':
        return { memberships: { some: { status: 'ACTIVE', expiresAt: { gt: now, lte: new Date(now.getTime() + rule.value * DAY) } } } };
      case 'membershipExpiredDaysAgo': {
        const cutoff = new Date(now.getTime() - rule.value * DAY);
        return {
          AND: [
            { memberships: { some: { status: { not: 'CANCELLED' }, expiresAt: { lte: cutoff } } } },
            { memberships: { none: { status: { not: 'CANCELLED' }, expiresAt: { gt: cutoff } } } },
          ],
        };
      }
      case 'visitsRemaining': {
        const cmp = rule.op === 'lte' ? { lte: rule.value } : rule.op === 'gte' ? { gte: rule.value } : { equals: rule.value };
        return { memberships: { some: { ...activeMembership, visitsRemaining: cmp } } };
      }
      case 'daysSinceLastVisit': {
        const cutoff = new Date(now.getTime() - rule.value * DAY);
        return rule.op === 'gte' ? { lastVisitAt: { not: null, lte: cutoff } } : { lastVisitAt: { gte: cutoff } };
      }
      case 'neverVisited':
        return rule.value ? { lastVisitAt: null } : { lastVisitAt: { not: null } };
      case 'registeredWithinDays':
        return { createdAt: { gte: new Date(now.getTime() - rule.value * DAY) } };
      case 'visitsLast30Days': {
        const grouped = await db.booking.groupBy({
          by: ['clientId'],
          where: { status: 'ATTENDED', session: { startsAt: { gte: new Date(now.getTime() - 30 * DAY), lte: now } } },
          _count: { _all: true },
        });
        const matching = grouped
          .filter((g) => (rule.op === 'gte' ? g._count._all >= rule.value : g._count._all <= rule.value))
          .map((g) => g.clientId);
        if (rule.op === 'lte') {
          const above = grouped.filter((g) => g._count._all > rule.value).map((g) => g.clientId);
          return { id: { notIn: above } };
        }
        return { id: { in: matching } };
      }
      case 'hasUpcomingBooking': {
        const upcoming: Prisma.BookingWhereInput = { status: 'BOOKED', session: { startsAt: { gt: now } } };
        return rule.value ? { bookings: { some: upcoming } } : { bookings: { none: upcoming } };
      }
      case 'trialCompletedNoMembership':
        return rule.value
          ? { AND: [{ trials: { some: { status: 'ATTENDED' } } }, { memberships: { none: {} } }] }
          : { OR: [{ trials: { none: { status: 'ATTENDED' } } }, { memberships: { some: {} } }] };
      case 'category':
        return { category: { in: rule.value } };
      case 'formatPreference':
        return { formatPreference: { in: rule.value } };
      case 'levelId':
        return { levelId: { in: rule.value } };
      case 'teacherId':
        return { bookings: { some: { status: 'ATTENDED', session: { teacherId: { in: rule.value } } } } };
      case 'tagId':
        return { tags: { some: { tagId: { in: rule.value } } } };
      case 'sourceId':
        return { sourceId: { in: rule.value } };
      case 'leadStage':
        return { lead: { stage: { in: rule.value } } };
      case 'marketingConsent':
        return { marketingConsent: rule.value };
    }
  }

  async count(definition: SegmentDefinition): Promise<number> {
    return this.prisma.client.count({ where: await this.where(definition) });
  }

  async clientIds(definition: SegmentDefinition, extra: Prisma.ClientWhereInput = {}): Promise<string[]> {
    const rows = await this.prisma.client.findMany({ where: { AND: [await this.where(definition), extra] }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async matches(clientId: string, definition: SegmentDefinition, db: Db = this.prisma): Promise<boolean> {
    if (!definition.rules.length) return true;
    return (await db.client.count({ where: { AND: [await this.where(definition, db), { id: clientId }] } })) > 0;
  }

  async preview(definition: SegmentDefinition, limit = 20): Promise<SegmentPreviewDto> {
    const where = await this.where(definition);
    const [count, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({ where, take: limit, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      count,
      sample: rows.map((c) => ({ id: c.id, name: fullName(c.firstName, c.lastName), phone: c.phone, category: c.category, lastVisitAt: c.lastVisitAt })),
    };
  }

  // ─── Stored segments ───

  async ensureSystemSegments(): Promise<void> {
    for (const s of SYSTEM_SEGMENTS) {
      await this.prisma.segment.upsert({
        where: { key: s.key },
        create: { key: s.key, name: s.name, description: s.description, definition: s.definition as Prisma.InputJsonValue, isSystem: true },
        update: {},
      });
    }
  }

  async list(): Promise<SegmentDto[]> {
    await this.ensureSystemSegments();
    const rows = await this.prisma.segment.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    return Promise.all(rows.map((s) => this.toDto(s)));
  }

  async toDto(s: { id: string; key: string | null; name: string; description: string | null; definition: unknown; isSystem: boolean; updatedAt: Date }): Promise<SegmentDto> {
    const definition = this.parse(s.definition);
    return {
      id: s.id,
      key: s.key,
      name: s.name,
      description: s.description,
      definition: definition as SegmentDto['definition'],
      isSystem: s.isSystem,
      clientCount: await this.count(definition),
      updatedAt: s.updatedAt,
    };
  }

  async get(id: string) {
    const s = await this.prisma.segment.findUnique({ where: { id } });
    if (!s) throw notFound('Segment');
    return s;
  }

  async definitionOf(segmentId: string): Promise<SegmentDefinition> {
    return this.parse((await this.get(segmentId)).definition);
  }

  async create(input: { name: string; description?: string; definition: unknown }, actor: AuthUser) {
    const definition = this.parse(input.definition);
    const s = await this.prisma.segment.create({
      data: { name: input.name, description: input.description, definition: definition as Prisma.InputJsonValue, createdById: actor.id },
    });
    await this.audit.log({ actor, action: 'segment.create', entityType: 'Segment', entityId: s.id, newValue: input });
    return this.toDto(s);
  }

  async update(id: string, input: { name?: string; description?: string; definition?: unknown }, actor: AuthUser) {
    const before = await this.get(id);
    const definition = input.definition !== undefined ? this.parse(input.definition) : undefined;
    const s = await this.prisma.segment.update({
      where: { id },
      data: {
        name: before.isSystem ? undefined : input.name,
        description: input.description,
        definition: definition as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.log({ actor, action: 'segment.update', entityType: 'Segment', entityId: id, oldValue: before, newValue: input });
    return this.toDto(s);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const s = await this.get(id);
    if (s.isSystem) throw new DomainError('FORBIDDEN', { message: 'Built-in segments cannot be deleted.' });
    await this.prisma.broadcast.updateMany({ where: { segmentId: id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { segmentId: null, audience: s.definition as Prisma.InputJsonValue } });
    await this.prisma.segment.delete({ where: { id } });
    await this.audit.log({ actor, action: 'segment.delete', entityType: 'Segment', entityId: id, oldValue: { name: s.name } });
  }
}
