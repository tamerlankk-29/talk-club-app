import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ensureBaseline } from './baseline';

/**
 * On the very first start of a new installation (no program yet), creates the
 * reference data the club needs to operate: the Talk Club program, the
 * Zheltoksan 118 location with offices 314–316, levels, group types, plans,
 * payment methods, lead sources, legal templates and notification templates.
 * Later starts do nothing, so admins' edits and deletions are never undone.
 */
@Injectable()
export class BaselineBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger('Baseline');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    // Tests build their own fixtures.
    if (process.env.NODE_ENV === 'test') return;
    if ((await this.prisma.program.count()) > 0) return;
    await ensureBaseline(this.prisma);
    this.logger.log('First start: reference data created (location, rooms, levels, plans, payment methods, templates, legal texts).');
  }
}
