import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AutomationRule, AutomationTrigger, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import {
  AttendanceMarkedEvent,
  BookingCancelledEvent,
  BookingCreatedEvent,
  ClientRegisteredEvent,
  Events,
  MembershipActivatedEvent,
  PaymentConfirmedEvent,
  TrialCompletedEvent,
} from '../../common/events/events';
import { TemplateVars } from '../../common/utils/template';
import { daysBetweenLocal } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { CrmService } from '../crm/crm.service';
import { PipelineService } from '../crm/pipeline.service';
import { NotificationVarsService } from '../notifications/notification-vars.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SegmentsService } from '../segments/segments.service';
import {
  actionsSchema,
  AutomationAction,
  conditionsSchema,
  DEFAULT_RULES,
  TRIGGER_CONFIG_SCHEMAS,
} from './automation.types';

interface TriggerContext {
  clientId: string;
  dedupeKey: string;
  refs: { membershipId?: string; bookingId?: string; trialId?: string; paymentId?: string };
}

export interface RuleInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  triggerConfig?: Record<string, unknown>;
  conditions?: unknown[];
  actions: unknown[];
  delayMinutes?: number;
  isActive?: boolean;
}

/**
 * Automation engine: TRIGGER → CONDITIONS → ACTIONS.
 * Event triggers react to domain events; scheduled triggers (expiring
 * memberships, low visits, inactivity) are evaluated by a background job.
 * Every (rule, event) pair runs at most once thanks to a dedupe key, and
 * conditions are re-checked when a delayed run executes.
 */
@Injectable()
export class AutomationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
    private readonly notifications: NotificationsService,
    private readonly vars: NotificationVarsService,
    private readonly crm: CrmService,
    private readonly pipeline: PipelineService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureDefaults();
    } catch (error) {
      this.logger.error(`Could not seed default automations: ${(error as Error).message}`);
    }
  }

  // ─── Rule management ───

  async ensureDefaults(): Promise<void> {
    for (const rule of DEFAULT_RULES) {
      await this.prisma.automationRule.upsert({
        where: { key: rule.key },
        create: {
          key: rule.key,
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          triggerConfig: rule.triggerConfig as Prisma.InputJsonValue,
          conditions: rule.conditions as Prisma.InputJsonValue,
          actions: rule.actions as Prisma.InputJsonValue,
          delayMinutes: rule.delayMinutes,
          isActive: rule.isActive,
          isSystem: true,
        },
        update: {},
      });
    }
  }

  validate(input: Partial<RuleInput> & { trigger: AutomationTrigger }) {
    const config = TRIGGER_CONFIG_SCHEMAS[input.trigger].safeParse(input.triggerConfig ?? {});
    const conditions = conditionsSchema.safeParse(input.conditions ?? []);
    const actions = input.actions !== undefined ? actionsSchema.safeParse(input.actions) : null;
    const issues = [config, conditions, ...(actions ? [actions] : [])]
      .filter((r) => !r.success)
      .flatMap((r) => (r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)));
    if (issues.length) throw new DomainError('VALIDATION_FAILED', { message: 'The automation is invalid.', details: { issues } });
    for (const a of actions?.success ? actions.data : []) {
      if (a.type === 'SEND_NOTIFICATION' && !a.templateKey && !(a.title && a.body)) {
        throw new DomainError('VALIDATION_FAILED', { message: 'A notification action needs a template or a title and text.' });
      }
    }
  }

  async list() {
    await this.ensureDefaults();
    const rules = await this.prisma.automationRule.findMany({ orderBy: [{ trigger: 'asc' }, { name: 'asc' }] });
    const stats = await this.prisma.automationRun.groupBy({ by: ['ruleId', 'status'], _count: { _all: true } });
    return rules.map((r) => ({
      ...r,
      stats: {
        completed: stats.find((s) => s.ruleId === r.id && s.status === 'COMPLETED')?._count._all ?? 0,
        skipped: stats.find((s) => s.ruleId === r.id && s.status === 'SKIPPED')?._count._all ?? 0,
        failed: stats.find((s) => s.ruleId === r.id && s.status === 'FAILED')?._count._all ?? 0,
        scheduled: stats.find((s) => s.ruleId === r.id && s.status === 'SCHEDULED')?._count._all ?? 0,
      },
    }));
  }

  async create(input: RuleInput, actor: AuthUser) {
    this.validate(input);
    const rule = await this.prisma.automationRule.create({
      data: {
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        triggerConfig: (input.triggerConfig ?? {}) as Prisma.InputJsonValue,
        conditions: (input.conditions ?? []) as Prisma.InputJsonValue,
        actions: input.actions as Prisma.InputJsonValue,
        delayMinutes: input.delayMinutes ?? 0,
        isActive: input.isActive ?? true,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actor, action: 'automation.create', entityType: 'AutomationRule', entityId: rule.id, newValue: input });
    return rule;
  }

  async update(id: string, input: Partial<RuleInput>, actor: AuthUser) {
    const before = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!before) throw notFound('Automation');
    const trigger = input.trigger ?? before.trigger;
    this.validate({
      trigger,
      triggerConfig: (input.triggerConfig ?? before.triggerConfig) as Record<string, unknown>,
      conditions: (input.conditions ?? before.conditions) as unknown[],
      actions: (input.actions ?? before.actions) as unknown[],
    });
    const rule = await this.prisma.automationRule.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        triggerConfig: input.triggerConfig as Prisma.InputJsonValue | undefined,
        conditions: input.conditions as Prisma.InputJsonValue | undefined,
        actions: input.actions as Prisma.InputJsonValue | undefined,
        delayMinutes: input.delayMinutes,
        isActive: input.isActive,
      },
    });
    await this.audit.log({ actor, action: 'automation.update', entityType: 'AutomationRule', entityId: id, oldValue: before, newValue: input });
    return rule;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Automation');
    if (rule.isSystem) throw new DomainError('FORBIDDEN', { message: 'Built-in automations can be switched off but not deleted.' });
    await this.prisma.automationRule.delete({ where: { id } });
    await this.audit.log({ actor, action: 'automation.delete', entityType: 'AutomationRule', entityId: id, oldValue: { name: rule.name } });
  }

  async runs(ruleId?: string, limit = 100) {
    return this.prisma.automationRun.findMany({
      where: ruleId ? { ruleId } : undefined,
      include: { rule: { select: { name: true } }, client: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Event triggers ───

  @OnEvent(Events.ClientRegistered)
  onRegistered(e: ClientRegisteredEvent) {
    return this.fire('CLIENT_REGISTERED', { clientId: e.clientId, dedupeKey: `client:${e.clientId}`, refs: {} });
  }

  @OnEvent(Events.TrialCompleted)
  onTrial(e: TrialCompletedEvent) {
    if (!e.clientId) return;
    return this.fire(e.attended ? 'TRIAL_ATTENDED' : 'TRIAL_NO_SHOW', {
      clientId: e.clientId,
      dedupeKey: `trial:${e.trialId}`,
      refs: { trialId: e.trialId },
    });
  }

  @OnEvent(Events.MembershipActivated)
  onMembership(e: MembershipActivatedEvent) {
    return this.fire('MEMBERSHIP_ACTIVATED', { clientId: e.clientId, dedupeKey: `membership:${e.membershipId}`, refs: { membershipId: e.membershipId } });
  }

  @OnEvent(Events.BookingCreated)
  async onBooking(e: BookingCreatedEvent) {
    await this.fire('BOOKING_CREATED', { clientId: e.clientId, dedupeKey: `booking:${e.bookingId}`, refs: { bookingId: e.bookingId } });
    // Low-visit reminders react immediately after a visit is used.
    const booking = await this.prisma.booking.findUnique({ where: { id: e.bookingId }, select: { membershipId: true } });
    if (booking?.membershipId) await this.scanLowVisits(booking.membershipId);
  }

  @OnEvent(Events.BookingCancelled)
  onCancelled(e: BookingCancelledEvent) {
    return this.fire('BOOKING_CANCELLED', { clientId: e.clientId, dedupeKey: `booking:${e.bookingId}`, refs: { bookingId: e.bookingId } });
  }

  @OnEvent(Events.AttendanceMarked)
  onAttendance(e: AttendanceMarkedEvent) {
    if (e.status !== 'ABSENT' || e.previousStatus !== null || e.kind === 'TRIAL') return;
    return this.fire('NO_SHOW', { clientId: e.clientId, dedupeKey: `booking:${e.bookingId}`, refs: { bookingId: e.bookingId } });
  }

  @OnEvent(Events.PaymentConfirmed)
  onPayment(e: PaymentConfirmedEvent) {
    return this.fire('PAYMENT_CONFIRMED', { clientId: e.clientId, dedupeKey: `payment:${e.paymentId}`, refs: { paymentId: e.paymentId } });
  }

  /** Schedules (and, without delay, immediately executes) runs of all active rules for a trigger. */
  async fire(trigger: AutomationTrigger, ctx: TriggerContext, rules?: AutomationRule[]): Promise<void> {
    try {
      const candidates = rules ?? (await this.prisma.automationRule.findMany({ where: { trigger, isActive: true } }));
      for (const rule of candidates) {
        const now = this.clock.now();
        const existing = await this.prisma.automationRun.findUnique({
          where: { ruleId_dedupeKey: { ruleId: rule.id, dedupeKey: ctx.dedupeKey } },
          select: { id: true },
        });
        if (existing) continue; // already fired for this event
        let run;
        try {
          run = await this.prisma.automationRun.create({
            data: {
              ruleId: rule.id,
              clientId: ctx.clientId,
              dedupeKey: ctx.dedupeKey,
              scheduledFor: new Date(now.getTime() + rule.delayMinutes * 60_000),
              context: ctx.refs as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue; // already fired
          throw error;
        }
        if (rule.delayMinutes === 0) await this.execute(run.id);
      }
    } catch (error) {
      this.logger.error(`Automation trigger ${trigger} failed: ${(error as Error).message}`);
    }
  }

  // ─── Scheduled triggers ───

  /** Background job: evaluate time-based triggers. */
  async scanScheduled(): Promise<void> {
    await this.scanExpiring();
    await this.scanExpired();
    await this.scanLowVisits();
    await this.scanInactivity();
  }

  private async scanExpiring(): Promise<void> {
    const rules = await this.prisma.automationRule.findMany({ where: { trigger: 'MEMBERSHIP_EXPIRING', isActive: true } });
    if (!rules.length) return;
    const thresholds = [...new Set(rules.map((r) => (r.triggerConfig as { daysBefore: number }).daysBefore))].sort((a, b) => a - b);
    const tz = await this.catalog.defaultTimezone();
    const now = this.clock.now();
    const horizon = new Date(now.getTime() + (thresholds[thresholds.length - 1] + 1) * 86_400_000);
    const memberships = await this.prisma.membership.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: now, lte: horizon } },
      select: { id: true, clientId: true, expiresAt: true },
    });
    for (const m of memberships) {
      // Already renewed? Then the reminder is pointless.
      const renewed = await this.prisma.membership.count({
        where: { clientId: m.clientId, status: 'ACTIVE', id: { not: m.id }, expiresAt: { gt: m.expiresAt } },
      });
      if (renewed) continue;
      const daysLeft = daysBetweenLocal(now, m.expiresAt, tz);
      const target = thresholds.find((n) => daysLeft <= n);
      if (target === undefined) continue;
      const due = rules.filter((r) => (r.triggerConfig as { daysBefore: number }).daysBefore === target);
      await this.fire('MEMBERSHIP_EXPIRING', { clientId: m.clientId, dedupeKey: `membership:${m.id}:expiring:${target}`, refs: { membershipId: m.id } }, due);
    }
  }

  private async scanExpired(): Promise<void> {
    const rules = await this.prisma.automationRule.findMany({ where: { trigger: 'MEMBERSHIP_EXPIRED', isActive: true } });
    if (!rules.length) return;
    const now = this.clock.now();
    const memberships = await this.prisma.membership.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRED'] }, expiresAt: { lte: now, gt: new Date(now.getTime() - 7 * 86_400_000) } },
      select: { id: true, clientId: true },
    });
    for (const m of memberships) {
      await this.fire('MEMBERSHIP_EXPIRED', { clientId: m.clientId, dedupeKey: `membership:${m.id}:expired`, refs: { membershipId: m.id } }, rules);
    }
  }

  async scanLowVisits(membershipId?: string): Promise<void> {
    const rules = await this.prisma.automationRule.findMany({ where: { trigger: 'LOW_VISITS', isActive: true } });
    if (!rules.length) return;
    const thresholds = [...new Set(rules.map((r) => (r.triggerConfig as { remaining: number }).remaining))].sort((a, b) => a - b);
    const now = this.clock.now();
    const memberships = await this.prisma.membership.findMany({
      where: {
        id: membershipId,
        status: 'ACTIVE',
        expiresAt: { gt: now },
        visitsRemaining: { lte: thresholds[thresholds.length - 1] },
      },
      select: { id: true, clientId: true, visitsRemaining: true, visitsTotal: true },
    });
    for (const m of memberships) {
      if (m.visitsTotal <= m.visitsRemaining) continue; // nothing used yet (e.g. a tiny plan)
      const target = thresholds.find((n) => m.visitsRemaining <= n);
      if (target === undefined) continue;
      const due = rules.filter((r) => (r.triggerConfig as { remaining: number }).remaining === target);
      await this.fire('LOW_VISITS', { clientId: m.clientId, dedupeKey: `membership:${m.id}:visits:${target}`, refs: { membershipId: m.id } }, due);
    }
  }

  private async scanInactivity(): Promise<void> {
    const rules = await this.prisma.automationRule.findMany({ where: { trigger: 'NO_VISIT_FOR_DAYS', isActive: true } });
    const now = this.clock.now();
    for (const rule of rules) {
      const days = (rule.triggerConfig as { days: number }).days;
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      const clients = await this.prisma.client.findMany({
        where: { status: 'ACTIVE', lastVisitAt: { lte: cutoff, gt: new Date(cutoff.getTime() - 30 * 86_400_000) } },
        select: { id: true, lastVisitAt: true },
        take: 1000,
      });
      for (const c of clients) {
        // One run per inactivity period: the key changes after the next visit.
        await this.fire(
          'NO_VISIT_FOR_DAYS',
          { clientId: c.id, dedupeKey: `client:${c.id}:novisit:${days}:${c.lastVisitAt!.toISOString().slice(0, 10)}`, refs: {} },
          [rule],
        );
      }
    }
  }

  /** Background job: execute delayed runs that are due. */
  async runDue(): Promise<number> {
    const due = await this.prisma.automationRun.findMany({
      where: { status: 'SCHEDULED', scheduledFor: { lte: this.clock.now() } },
      select: { id: true },
      orderBy: { scheduledFor: 'asc' },
      take: 200,
    });
    for (const run of due) await this.execute(run.id);
    return due.length;
  }

  // ─── Execution ───

  async execute(runId: string): Promise<void> {
    const run = await this.prisma.automationRun.findUnique({ where: { id: runId }, include: { rule: true } });
    if (!run || run.status !== 'SCHEDULED') return;
    const claimed = await this.prisma.automationRun.updateMany({
      where: { id: runId, status: 'SCHEDULED' },
      data: { status: 'COMPLETED', executedAt: this.clock.now() },
    });
    if (claimed.count !== 1) return; // another worker took it
    try {
      if (!run.rule.isActive) return void (await this.finish(runId, 'SKIPPED', { reason: 'Rule disabled' }));
      const conditions = conditionsSchema.parse(run.rule.conditions ?? []);
      if (run.clientId && conditions.length) {
        const matches = await this.segments.matches(run.clientId, { match: 'all', rules: conditions });
        if (!matches) return void (await this.finish(runId, 'SKIPPED', { reason: 'Conditions not met' }));
      }
      const actions = actionsSchema.parse(run.rule.actions);
      const refs = (run.context ?? {}) as TriggerContext['refs'];
      const vars = await this.contextVars(refs, run.clientId);
      const results: string[] = [];
      for (const action of actions) results.push(await this.perform(action, run.rule, run.clientId, vars));
      await this.finish(runId, 'COMPLETED', { actions: results });
      await this.prisma.automationRule.update({
        where: { id: run.ruleId },
        data: { runCount: { increment: 1 }, lastRunAt: this.clock.now() },
      });
    } catch (error) {
      this.logger.error(`Automation run ${runId} failed: ${(error as Error).message}`);
      await this.prisma.automationRun.update({ where: { id: runId }, data: { status: 'FAILED', error: (error as Error).message.slice(0, 500) } });
    }
  }

  private async finish(runId: string, status: 'COMPLETED' | 'SKIPPED', result: object): Promise<void> {
    await this.prisma.automationRun.update({ where: { id: runId }, data: { status, result: result as Prisma.InputJsonValue } });
  }

  private async contextVars(refs: TriggerContext['refs'], clientId: string | null): Promise<TemplateVars> {
    let vars: TemplateVars = clientId ? await this.vars.client(clientId) : {};
    if (refs.membershipId) vars = { ...vars, ...((await this.vars.membership(refs.membershipId)) ?? {}) };
    if (refs.bookingId) vars = { ...vars, ...((await this.vars.booking(refs.bookingId)) ?? {}) };
    if (refs.paymentId) vars = { ...vars, ...((await this.vars.payment(refs.paymentId)) ?? {}) };
    return vars;
  }

  private async perform(action: AutomationAction, rule: AutomationRule, clientId: string | null, vars: TemplateVars): Promise<string> {
    switch (action.type) {
      case 'SEND_NOTIFICATION': {
        if (!clientId) return 'skipped: no client';
        const ids = await this.notifications.notifyClient(clientId, {
          templateKey: action.templateKey,
          content: action.templateKey ? undefined : { title: action.title!, body: action.body!, buttonLabel: action.buttonLabel, buttonUrl: action.buttonUrl },
          channels: action.channels,
          category: action.category,
          vars,
          data: { automationRuleId: rule.id },
        });
        return `notification:${ids.length}`;
      }
      case 'CREATE_TASK': {
        const lead = clientId ? await this.prisma.lead.findUnique({ where: { clientId }, select: { id: true } }) : null;
        const due = action.dueInHours !== undefined ? new Date(this.clock.now().getTime() + action.dueInHours * 3_600_000) : undefined;
        const task = await this.crm.createTask(
          {
            title: action.title,
            description: action.description ?? `Created by automation "${rule.name}".`,
            clientId: clientId ?? undefined,
            leadId: lead?.id,
            priority: action.priority,
            dueAt: due?.toISOString(),
            assignedToId: action.assignToUserId,
          },
          null,
          rule.id,
        );
        return `task:${task.id}`;
      }
      case 'ADD_TAG': {
        if (!clientId) return 'skipped: no client';
        await this.prisma.clientTag.upsert({
          where: { clientId_tagId: { clientId, tagId: action.tagId } },
          create: { clientId, tagId: action.tagId },
          update: {},
        });
        return `tag:${action.tagId}`;
      }
      case 'SET_LEAD_STAGE': {
        if (!clientId) return 'skipped: no client';
        const lead = await this.pipeline.ensureLead(clientId);
        if (lead.stage !== action.stage) await this.pipeline.setStage(lead, action.stage, `Automation "${rule.name}"`, null);
        return `stage:${action.stage}`;
      }
    }
  }
}

