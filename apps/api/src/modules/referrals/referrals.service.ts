import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, ReferralStatus } from '@prisma/client';
import { randomInt } from 'node:crypto';
import type { AuthUser } from '../../common/auth/auth-user';
import { DomainError } from '../../common/errors/domain-error';
import { Events, MembershipActivatedEvent, TrialCompletedEvent } from '../../common/events/events';
import { transliterate } from '../../common/utils/transliterate';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Referral tracking. Every client gets a personal code (e.g. TAMERLAN10); a new
 * client who registers with it is linked to the referrer. Rewards are not
 * hardcoded — admins record them manually (status REWARDED + note) based on the
 * reward policy configured in Settings → Referrals.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ensureCode(db: Db, clientId: string, firstName: string): Promise<string> {
    const existing = await db.referralCode.findUnique({ where: { clientId } });
    if (existing) return existing.code;
    const base =
      transliterate(firstName)
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 10) || 'TALK';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `${base}${randomInt(attempt < 4 ? 10 : 100, attempt < 4 ? 100 : 1000)}`;
      const taken = await db.referralCode.findUnique({ where: { code } });
      if (taken) continue;
      await db.referralCode.create({ data: { clientId, code } });
      return code;
    }
    const fallback = `${base}${Date.now().toString(36).toUpperCase()}`;
    await db.referralCode.create({ data: { clientId, code: fallback } });
    return fallback;
  }

  /** Links a newly registered client to the owner of `code`. Unknown or own codes are ignored. */
  async applyCode(db: Db, referredClientId: string, rawCode: string | null | undefined): Promise<string | null> {
    const code = rawCode?.trim().toUpperCase();
    if (!code) return null;
    const referralCode = await db.referralCode.findUnique({ where: { code } });
    if (!referralCode || !referralCode.isActive || referralCode.clientId === referredClientId) return null;
    const already = await db.referral.findUnique({ where: { referredClientId } });
    if (already) return null;
    await db.referral.create({
      data: { codeId: referralCode.id, referrerClientId: referralCode.clientId, referredClientId },
    });
    return code;
  }

  async list(status?: ReferralStatus) {
    return this.prisma.referral.findMany({
      where: status ? { status } : undefined,
      include: {
        code: true,
        referrer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        referred: { select: { id: true, firstName: true, lastName: true, phone: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async markRewarded(id: string, note: string, actor: AuthUser) {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) throw new DomainError('NOT_FOUND', { message: 'Referral not found.' });
    const updated = await this.prisma.referral.update({
      where: { id },
      data: { status: 'REWARDED', rewardNote: note, rewardedAt: new Date() },
    });
    await this.audit.log({
      actor,
      action: 'referral.reward',
      entityType: 'Referral',
      entityId: id,
      oldValue: { status: referral.status },
      newValue: { status: 'REWARDED', note },
    });
    return updated;
  }

  @OnEvent(Events.TrialCompleted)
  async onTrialCompleted(event: TrialCompletedEvent): Promise<void> {
    if (!event.clientId || !event.attended) return;
    await this.advance(event.clientId, 'TRIAL_COMPLETED', ['REGISTERED']);
  }

  @OnEvent(Events.MembershipActivated)
  async onMembershipActivated(event: MembershipActivatedEvent): Promise<void> {
    await this.advance(event.clientId, 'CONVERTED', ['REGISTERED', 'TRIAL_COMPLETED']);
  }

  private async advance(clientId: string, status: ReferralStatus, from: ReferralStatus[]): Promise<void> {
    try {
      await this.prisma.referral.updateMany({
        where: { referredClientId: clientId, status: { in: from } },
        data: { status },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      this.logger.warn(`Referral status update failed: ${error.message}`);
    }
  }
}
