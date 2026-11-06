import { Injectable } from '@nestjs/common';
import type { Location, Program } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { DEFAULT_TIMEZONE } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';

const TTL_MS = 60_000;

/**
 * Lookup helpers for programs and locations. The platform is multi-location and
 * multi-program by design; "default" means the first active one (Talk Club, Almaty).
 */
@Injectable()
export class CatalogService {
  private cache: { program: Program | null; location: Location | null; tz: Map<string, string>; at: number } | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  private async load() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache;
    const [program, locations] = await Promise.all([
      this.prisma.program.findFirst({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.location.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    this.cache = {
      program,
      location: locations.find((l) => l.isActive) ?? locations[0] ?? null,
      tz: new Map(locations.map((l) => [l.id, l.timezone])),
      at: Date.now(),
    };
    return this.cache;
  }

  async defaultProgram(): Promise<Program> {
    const { program } = await this.load();
    if (!program) throw new DomainError('NOT_FOUND', { message: 'No active program is configured.' });
    return program;
  }

  async defaultLocation(): Promise<Location> {
    const { location } = await this.load();
    if (!location) throw new DomainError('NOT_FOUND', { message: 'No location is configured.' });
    return location;
  }

  async timezoneFor(locationId?: string | null): Promise<string> {
    const cache = await this.load();
    if (locationId && cache.tz.has(locationId)) return cache.tz.get(locationId)!;
    return cache.location?.timezone ?? DEFAULT_TIMEZONE;
  }

  async defaultTimezone(): Promise<string> {
    return this.timezoneFor(null);
  }

  invalidate(): void {
    this.cache = null;
  }
}
