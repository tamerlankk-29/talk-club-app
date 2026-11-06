import { Injectable } from '@nestjs/common';
import type { LegalDocument, LegalDocumentType } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { RequestContext } from '../../common/request-context';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Versioned legal texts (terms, privacy policy, public offer) and the record of
 * who accepted which version, when, and from which device.
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  current(type: LegalDocumentType, db: Db = this.prisma): Promise<LegalDocument | null> {
    return db.legalDocument.findFirst({ where: { type, isCurrent: true }, orderBy: { version: 'desc' } });
  }

  async currentAll(): Promise<LegalDocument[]> {
    return this.prisma.legalDocument.findMany({ where: { isCurrent: true }, orderBy: { type: 'asc' } });
  }

  versions(type: LegalDocumentType): Promise<LegalDocument[]> {
    return this.prisma.legalDocument.findMany({ where: { type }, orderBy: { version: 'desc' } });
  }

  /** Records acceptance of the current version of each document type. Returns acceptance ids by type. */
  async recordAcceptance(
    db: Db,
    input: { userId: string | null; clientId: string | null; types: LegalDocumentType[]; context: string },
  ): Promise<Partial<Record<LegalDocumentType, string>>> {
    const ctx = RequestContext.get();
    const result: Partial<Record<LegalDocumentType, string>> = {};
    for (const type of input.types) {
      const doc = await this.current(type, db);
      if (!doc) continue;
      const acceptance = await db.agreementAcceptance.create({
        data: {
          userId: input.userId,
          clientId: input.clientId,
          documentId: doc.id,
          documentType: doc.type,
          documentVersion: doc.version,
          context: input.context,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          acceptedAt: this.clock.now(),
        },
      });
      result[type] = acceptance.id;
    }
    return result;
  }

  async publish(
    input: { type: LegalDocumentType; title: string; content: string },
    actor: AuthUser,
  ): Promise<LegalDocument> {
    return this.prisma.transaction(async (tx) => {
      const latest = await tx.legalDocument.findFirst({ where: { type: input.type }, orderBy: { version: 'desc' } });
      await tx.legalDocument.updateMany({ where: { type: input.type, isCurrent: true }, data: { isCurrent: false } });
      const doc = await tx.legalDocument.create({
        data: {
          type: input.type,
          version: (latest?.version ?? 0) + 1,
          title: input.title,
          content: input.content,
          isCurrent: true,
          createdById: actor.id,
        },
      });
      await this.audit.log(
        {
          actor,
          action: 'legal.publish',
          entityType: 'LegalDocument',
          entityId: doc.id,
          oldValue: latest ? { version: latest.version } : null,
          newValue: { type: doc.type, version: doc.version, title: doc.title },
        },
        tx,
      );
      return doc;
    });
  }
}
