import { Injectable } from '@nestjs/common';
import { Prisma, TimeOfDay, TrialOutcome, TrialStatus } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { Events, TrialRequestedEvent } from '../../common/events/events';
import { fullName } from '../../common/utils/names';
import { normalizePhone } from '../../common/utils/phone';
import { formatSessionTime } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { CrmService } from '../crm/crm.service';
import { PipelineService } from '../crm/pipeline.service';
import { SettingsService } from '../settings/settings.service';

export interface TrialRequestInput {
  name: string;
  phone: string;
  levelId?: string;
  preferredDays?: number[];
  preferredTimes?: TimeOfDay[];
  comment?: string;
  sourceCode?: string;
}

const trialInclude = {
  level: { select: { id: true, name: true } },
  session: { include: { teacher: { select: { firstName: true, lastName: true } }, groupType: { select: { name: true } }, location: { select: { timezone: true } } } },
  payment: { select: { id: true, status: true, amount: true } },
  client: { select: { id: true, firstName: true, lastName: true } },
  lead: { select: { id: true, stage: true } },
} satisfies Prisma.TrialInclude;
type TrialRow = Prisma.TrialGetPayload<{ include: typeof trialInclude }>;

@Injectable()
export class TrialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly attendance: AttendanceService,
    private readonly crm: CrmService,
    private readonly pipeline: PipelineService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
  ) {}

  /** Public trial request form ("Book a trial — 1,500 KZT"). Creates or updates the CRM lead. */
  async request(input: TrialRequestInput): Promise<{ id: string; status: TrialStatus; price: number }> {
    const trialSettings = await this.settings.get('trial');
    if (!trialSettings.enabled) throw new DomainError('BOOKING_TRIALS_DISABLED');
    const phone = normalizePhone(input.phone);
    if (!phone) throw new DomainError('AUTH_PHONE_INVALID');

    const open = await this.prisma.trial.findFirst({ where: { phone, status: { in: ['REQUESTED', 'SCHEDULED'] } } });
    if (open) return { id: open.id, status: open.status, price: open.price };

    const source = input.sourceCode ? await this.prisma.leadSource.findUnique({ where: { code: input.sourceCode.toUpperCase() } }) : null;
    const client = await this.prisma.client.findUnique({ where: { phone } });
    let lead = client ? await this.pipeline.ensureLead(client.id) : await this.prisma.lead.findFirst({ where: { phone } });
    if (!lead) {
      lead = await this.prisma.lead.create({
        data: {
          name: input.name.trim(),
          phone,
          sourceId: source?.id ?? (await this.prisma.leadSource.findUnique({ where: { code: 'WEBSITE' } }))?.id,
          levelId: input.levelId,
          preferredDays: input.preferredDays ?? [],
          preferredTimes: input.preferredTimes ?? [],
          notes: input.comment,
        },
      });
    }
    const trial = await this.prisma.trial.create({
      data: {
        leadId: lead.id,
        clientId: client?.id ?? null,
        name: input.name.trim(),
        phone,
        levelId: input.levelId ?? client?.levelId ?? null,
        preferredDays: input.preferredDays ?? [],
        preferredTimes: input.preferredTimes ?? [],
        comment: input.comment ?? null,
        price: trialSettings.price,
        source: 'form',
      },
    });
    if (lead.stage === 'NEW_LEAD' || lead.stage === 'LOST') {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { stage: 'INTERESTED', stageChangedAt: this.clock.now() } });
    }
    await this.events.publish<TrialRequestedEvent>(Events.TrialRequested, { trialId: trial.id, leadId: lead.id });
    return { id: trial.id, status: trial.status, price: trial.price };
  }

  async list(status?: TrialStatus) {
    const rows = await this.prisma.trial.findMany({
      where: status ? { status } : undefined,
      include: trialInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((t) => this.toDto(t));
  }

  async get(id: string) {
    const row = await this.prisma.trial.findUnique({ where: { id }, include: trialInclude });
    if (!row) throw notFound('Trial');
    return this.toDto(row);
  }

  /** Admin assigns the trial to a session: creates the client profile if needed and books it. */
  async schedule(id: string, sessionId: string, actor: AuthUser, overrideCapacity = false) {
    const trial = await this.prisma.trial.findUnique({ where: { id } });
    if (!trial) throw notFound('Trial');
    if (trial.status !== 'REQUESTED' && trial.status !== 'CANCELLED') throw new DomainError('TRIAL_INVALID_STATE');
    let clientId = trial.clientId;
    if (!clientId) {
      const existing = await this.prisma.client.findUnique({ where: { phone: trial.phone } });
      if (existing) clientId = existing.id;
      else if (trial.leadId) clientId = (await this.crm.convertLead(trial.leadId, actor)).clientId;
      else {
        const [firstName, ...rest] = trial.name.split(/\s+/);
        clientId = (
          await this.prisma.client.create({
            data: { firstName, lastName: rest.join(' ') || null, phone: trial.phone, levelId: trial.levelId, preferredDays: trial.preferredDays, preferredTimes: trial.preferredTimes },
          })
        ).id;
      }
      await this.prisma.trial.update({ where: { id }, data: { clientId } });
    }
    await this.bookings.book({
      sessionId,
      clientId,
      kind: 'TRIAL',
      source: 'TRIAL_REQUEST',
      actor: { userId: actor.id, source: 'ADMIN' },
      trialId: id,
      overrides: { trialLimit: true, capacity: overrideCapacity, level: true },
    });
    await this.audit.log({ actor, action: 'trial.schedule', entityType: 'Trial', entityId: id, newValue: { sessionId } });
    return this.get(id);
  }

  async markAttendance(id: string, attended: boolean, actor: AuthUser) {
    const trial = await this.prisma.trial.findUnique({ where: { id } });
    if (!trial?.bookingId) throw new DomainError('TRIAL_INVALID_STATE', { message: 'The trial is not scheduled.' });
    await this.attendance.mark(trial.bookingId, attended ? 'PRESENT' : 'ABSENT', actor);
    return this.get(id);
  }

  async setOutcome(id: string, outcome: TrialOutcome, notes: string | undefined, actor: AuthUser) {
    const trial = await this.prisma.trial.findUnique({ where: { id } });
    if (!trial) throw notFound('Trial');
    await this.prisma.trial.update({
      where: { id },
      data: { outcome, notes: notes ? [trial.notes, notes].filter(Boolean).join('\n') : trial.notes },
    });
    if (trial.leadId && outcome === 'NOT_INTERESTED') {
      const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: trial.leadId } });
      if (lead.stage !== 'LOST') await this.pipeline.setStage(lead, 'LOST', 'Not interested after trial', actor.id);
    }
    await this.audit.log({ actor, action: 'trial.outcome', entityType: 'Trial', entityId: id, oldValue: { outcome: trial.outcome }, newValue: { outcome } });
    return this.get(id);
  }

  async cancel(id: string, reason: string, actor: AuthUser) {
    const trial = await this.prisma.trial.findUnique({ where: { id } });
    if (!trial) throw notFound('Trial');
    if (trial.bookingId) {
      await this.bookings.cancelByAdmin(trial.bookingId, { reason, waivePenalty: true, notifyClient: true }, actor);
    } else {
      await this.prisma.trial.update({ where: { id }, data: { status: 'CANCELLED' } });
    }
    return this.get(id);
  }

  private toDto(t: TrialRow) {
    const s = t.session;
    return {
      id: t.id,
      name: t.name,
      phone: t.phone,
      status: t.status,
      outcome: t.outcome,
      price: t.price,
      level: t.level,
      preferredDays: t.preferredDays,
      preferredTimes: t.preferredTimes,
      comment: t.comment,
      notes: t.notes,
      source: t.source,
      clientId: t.clientId,
      clientName: t.client ? fullName(t.client.firstName, t.client.lastName) : null,
      leadId: t.leadId,
      leadStage: t.lead?.stage ?? null,
      bookingId: t.bookingId,
      session: s
        ? {
            id: s.id,
            title: s.title ?? s.groupType?.name ?? 'Speaking Club',
            startsAt: s.startsAt,
            label: formatSessionTime(s.startsAt, s.location.timezone),
            teacherName: s.teacher ? fullName(s.teacher.firstName, s.teacher.lastName) : null,
          }
        : null,
      payment: t.payment,
      attendedAt: t.attendedAt,
      createdAt: t.createdAt,
    };
  }
}
