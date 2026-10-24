import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestContext } from '../../common/request-context';
import { Db, PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actor: AuthUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

/**
 * Append-only log of administrative actions: who, what, when, old → new value,
 * and why. Pass the transaction client so the log commits with the change.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    const ctx = RequestContext.get();
    try {
      await db.auditLog.create({
        data: {
          actorId: entry.actor?.id ?? null,
          actorLabel: entry.actor ? entry.actor.displayName : 'System',
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          oldValue: toJson(entry.oldValue),
          newValue: toJson(entry.newValue),
          reason: entry.reason ?? null,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
        },
      });
    } catch (error) {
      // Inside a transaction the error must propagate so the change rolls back with it.
      if (db !== this.prisma) throw error;
      this.logger.error(`Failed to write audit log for ${entry.action}: ${(error as Error).message}`);
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
