import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Lead, LeadStage } from '@prisma/client';
import { ClockService } from '../../common/clock/clock.service';
import {
  AttendanceMarkedEvent,
  ClientRegisteredEvent,
  Events,
  MembershipActivatedEvent,
  TrialCompletedEvent,
  TrialScheduledEvent,
} from '../../common/events/events';
import { fullName } from '../../common/utils/names';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW_LEAD: 'New lead',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  TRIAL_BOOKED: 'Trial booked',
  TRIAL_ATTENDED: 'Trial attended',
  MEMBERSHIP_PURCHASED: 'Membership purchased',
  ACTIVE_CLIENT: 'Active client',
  MEMBERSHIP_EXPIRING: 'Membership expiring',
  RENEWED: 'Renewed',
  INACTIVE: 'Inactive',
  LOST: 'Lost',
};

export const FUNNEL_ORDER: LeadStage[] = [
  'NEW_LEAD',
  'CONTACTED',
  'INTERESTED',
  'TRIAL_BOOKED',
  'TRIAL_ATTENDED',
  'MEMBERSHIP_PURCHASED',
  'ACTIVE_CLIENT',
  'MEMBERSHIP_EXPIRING',
  'RENEWED',
  'INACTIVE',
  'LOST',
];

const PRE_PURCHASE: LeadStage[] = ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'LOST'];
const POST_PURCHASE: LeadStage[] = ['MEMBERSHIP_PURCHASED', 'ACTIVE_CLIENT', 'MEMBERSHIP_EXPIRING', 'RENEWED', 'INACTIVE'];

/** Allowed automatic transitions: target stage → stages it may be reached from. */
const AUTO_FROM: Partial<Record<LeadStage, LeadStage[]>> = {
  TRIAL_BOOKED: ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'LOST'],
  TRIAL_ATTENDED: ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'LOST'],
  MEMBERSHIP_PURCHASED: PRE_PURCHASE,
  RENEWED: [...POST_PURCHASE, ...PRE_PURCHASE],
  ACTIVE_CLIENT: ['MEMBERSHIP_PURCHASED', 'RENEWED'],
  MEMBERSHIP_EXPIRING: ['MEMBERSHIP_PURCHASED', 'ACTIVE_CLIENT', 'RENEWED'],
  INACTIVE: ['MEMBERSHIP_PURCHASED', 'ACTIVE_CLIENT', 'MEMBERSHIP_EXPIRING', 'RENEWED'],
};

/**
 * Keeps every person's CRM card in the right funnel stage automatically:
 * registration → trial booked → trial attended → membership purchased →
 * active client → membership expiring → renewed / inactive.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  /** Returns the client's lead, creating (or linking by phone) one if needed. */
  async ensureLead(clientId: string, db: Db = this.prisma): Promise<Lead> {
    const existing = await db.lead.findUnique({ where: { clientId } });
    if (existing) return existing;
    const client = await db.client.findUniqueOrThrow({ where: { id: clientId } });
    if (client.phone) {
      const byPhone = await db.lead.findFirst({ where: { phone: client.phone, clientId: null }, orderBy: { createdAt: 'desc' } });
      if (byPhone) return db.lead.update({ where: { id: byPhone.id }, data: { clientId } });
    }
    return db.lead.create({
      data: {
        clientId,
        name: fullName(client.firstName, client.lastName),
        phone: client.phone,
        email: client.email,
        sourceId: client.sourceId,
        levelId: client.levelId,
        preferredDays: client.preferredDays,
        preferredTimes: client.preferredTimes,
      },
    });
  }

  /** Moves a lead automatically if the transition is allowed. */
  async advance(clientId: string, to: LeadStage, reason: string): Promise<void> {
    try {
      const lead = await this.ensureLead(clientId);
      if (lead.stage === to) return;
      const allowed = AUTO_FROM[to];
      if (allowed && !allowed.includes(lead.stage)) return;
      await this.setStage(lead, to, reason, null);
    } catch (error) {
      this.logger.error(`Pipeline update failed for client ${clientId}: ${(error as Error).message}`);
    }
  }

  async setStage(lead: Lead, to: LeadStage, reason: string, actorId: string | null, db: Db = this.prisma): Promise<Lead> {
    const updated = await db.lead.update({ where: { id: lead.id }, data: { stage: to, stageChangedAt: this.clock.now() } });
    if (lead.clientId) {
      await db.clientActivity.create({
        data: {
          clientId: lead.clientId,
          type: 'crm.stage',
          title: `CRM stage: ${STAGE_LABELS[lead.stage]} → ${STAGE_LABELS[to]}`,
          data: { from: lead.stage, to, reason },
          actorId,
        },
      });
    }
    return updated;
  }

  @OnEvent(Events.ClientRegistered)
  async onRegistered(e: ClientRegisteredEvent): Promise<void> {
    try {
      await this.ensureLead(e.clientId);
    } catch (error) {
      this.logger.error(`Could not create lead: ${(error as Error).message}`);
    }
  }

  @OnEvent(Events.TrialScheduled)
  onTrialScheduled(e: TrialScheduledEvent) {
    return this.advance(e.clientId, 'TRIAL_BOOKED', 'Trial booked');
  }

  @OnEvent(Events.TrialCompleted)
  async onTrialCompleted(e: TrialCompletedEvent) {
    if (e.clientId && e.attended) await this.advance(e.clientId, 'TRIAL_ATTENDED', 'Trial attended');
  }

  @OnEvent(Events.MembershipActivated)
  onMembershipActivated(e: MembershipActivatedEvent) {
    return this.advance(e.clientId, e.isRenewal ? 'RENEWED' : 'MEMBERSHIP_PURCHASED', e.isRenewal ? 'Membership renewed' : 'First membership');
  }

  @OnEvent(Events.AttendanceMarked)
  async onAttendance(e: AttendanceMarkedEvent) {
    if (e.status !== 'ABSENT' && e.kind === 'MEMBERSHIP') await this.advance(e.clientId, 'ACTIVE_CLIENT', 'Attending with a membership');
  }

  /** Background job: expiring and inactive lifecycle stages. */
  async refreshLifecycle(): Promise<{ expiring: number; inactive: number }> {
    const crm = await this.settings.get('crm');
    const now = this.clock.now();
    const soon = new Date(now.getTime() + crm.expiringSoonDays * 86_400_000);
    const inactiveCutoff = new Date(now.getTime() - crm.inactiveAfterDays * 86_400_000);
    let expiring = 0;
    let inactive = 0;

    const expiringLeads = await this.prisma.lead.findMany({
      where: {
        stage: { in: AUTO_FROM.MEMBERSHIP_EXPIRING },
        client: {
          memberships: { some: { status: 'ACTIVE', expiresAt: { gt: now, lte: soon } } },
          NOT: { memberships: { some: { status: 'ACTIVE', expiresAt: { gt: soon } } } },
        },
      },
    });
    for (const lead of expiringLeads) {
      await this.setStage(lead, 'MEMBERSHIP_EXPIRING', 'Membership expires soon', null);
      expiring += 1;
    }

    const inactiveLeads = await this.prisma.lead.findMany({
      where: {
        stage: { in: AUTO_FROM.INACTIVE },
        client: {
          memberships: { none: { status: 'ACTIVE', expiresAt: { gt: now } } },
          OR: [{ lastVisitAt: null }, { lastVisitAt: { lte: inactiveCutoff } }],
        },
      },
    });
    for (const lead of inactiveLeads) {
      await this.setStage(lead, 'INACTIVE', 'No active membership', null);
      inactive += 1;
    }
    if (expiring || inactive) this.logger.log(`Pipeline: ${expiring} expiring, ${inactive} inactive`);
    return { expiring, inactive };
  }
}
