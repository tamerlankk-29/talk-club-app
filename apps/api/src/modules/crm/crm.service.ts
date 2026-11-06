import { Injectable } from '@nestjs/common';
import { LeadStage, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { normalizePhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CommunicationDto,
  CreateCommunicationDto,
  CreateLeadDto,
  CreateTagDto,
  CreateTaskDto,
  LeadDetailDto,
  LeadDto,
  LeadQueryDto,
  PipelineColumnDto,
  TagDto,
  TaskDto,
  TaskQueryDto,
  UpdateLeadDto,
  UpdateTagDto,
  UpdateTaskDto,
} from './dto/crm.dto';
import { FUNNEL_ORDER, PipelineService, STAGE_LABELS } from './pipeline.service';

const leadInclude = {
  source: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, displayName: true } },
  level: { select: { id: true, name: true } },
  _count: { select: { tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } } },
} satisfies Prisma.LeadInclude;
type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

const taskInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  lead: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.CrmTaskInclude;
type TaskRow = Prisma.CrmTaskGetPayload<{ include: typeof taskInclude }>;

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  // ─── Leads & pipeline ───

  private leadWhere(query: LeadQueryDto): Prisma.LeadWhereInput {
    const phone = query.q ? normalizePhone(query.q) : null;
    return {
      stage: query.stage,
      sourceId: query.sourceId,
      assignedToId: query.assignedToId,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          ...(phone ? [{ phone }] : []),
        ],
      }),
    };
  }

  async pipelineBoard(query: LeadQueryDto): Promise<PipelineColumnDto[]> {
    const where = this.leadWhere({ ...query, stage: undefined });
    const counts = await this.prisma.lead.groupBy({ by: ['stage'], where, _count: { _all: true } });
    const perStage = query.perStage ?? 30;
    return Promise.all(
      FUNNEL_ORDER.map(async (stage) => {
        const rows = await this.prisma.lead.findMany({
          where: { ...where, stage },
          include: leadInclude,
          orderBy: { stageChangedAt: 'desc' },
          take: perStage,
        });
        return {
          stage,
          label: STAGE_LABELS[stage],
          count: counts.find((c) => c.stage === stage)?._count._all ?? 0,
          leads: await this.toLeadDtos(rows),
        };
      }),
    );
  }

  async listLeads(query: LeadQueryDto): Promise<LeadDto[]> {
    const rows = await this.prisma.lead.findMany({
      where: this.leadWhere(query),
      include: leadInclude,
      orderBy: { stageChangedAt: 'desc' },
      take: 200,
    });
    return this.toLeadDtos(rows);
  }

  async getLead(id: string): Promise<LeadDetailDto> {
    const row = await this.prisma.lead.findUnique({ where: { id }, include: leadInclude });
    if (!row) throw notFound('Lead');
    const [dto] = await this.toLeadDtos([row]);
    const [trials, communications, tasks] = await Promise.all([
      this.prisma.trial.findMany({
        where: { OR: [{ leadId: id }, ...(row.clientId ? [{ clientId: row.clientId }] : [])] },
        include: { session: { select: { startsAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.communications({ leadId: id, clientId: row.clientId ?? undefined }),
      this.listTasks({ leadId: id, scope: 'all' }, null),
    ]);
    return {
      ...dto,
      trials: trials.map((t) => ({ id: t.id, status: t.status, outcome: t.outcome, sessionStartsAt: t.session?.startsAt ?? null, createdAt: t.createdAt })),
      communications,
      tasks,
    };
  }

  async createLead(dto: CreateLeadDto, actor: AuthUser): Promise<LeadDetailDto> {
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone) throw new DomainError('AUTH_PHONE_INVALID');
    if (phone) {
      const existing = await this.prisma.lead.findFirst({ where: { phone } });
      if (existing) throw new DomainError('CONFLICT', { message: 'A lead with this phone number already exists.', details: { leadId: existing.id } });
    }
    const client = phone ? await this.prisma.client.findUnique({ where: { phone } }) : null;
    if (client && (await this.prisma.lead.findUnique({ where: { clientId: client.id } }))) {
      throw new DomainError('CONFLICT', { message: 'This client already has a CRM card.' });
    }
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        phone,
        email: dto.email?.toLowerCase(),
        sourceId: dto.sourceId,
        levelId: dto.levelId,
        preferredDays: dto.preferredDays ?? [],
        preferredTimes: dto.preferredTimes ?? [],
        notes: dto.notes,
        assignedToId: dto.assignedToId,
        clientId: client?.id,
      },
    });
    await this.audit.log({ actor, action: 'lead.create', entityType: 'Lead', entityId: lead.id, newValue: dto });
    return this.getLead(lead.id);
  }

  async updateLead(id: string, dto: UpdateLeadDto, actor: AuthUser): Promise<LeadDetailDto> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw notFound('Lead');
    const phone = dto.phone !== undefined ? (dto.phone ? normalizePhone(dto.phone) : null) : undefined;
    if (dto.phone && !phone) throw new DomainError('AUTH_PHONE_INVALID');
    const { stage, ...fields } = dto;
    await this.prisma.lead.update({
      where: { id },
      data: { ...fields, phone, email: dto.email?.toLowerCase(), lostReason: stage === 'LOST' ? dto.lostReason : fields.lostReason },
    });
    if (stage && stage !== lead.stage) await this.pipeline.setStage(lead, stage, 'Changed manually', actor.id);
    await this.audit.log({ actor, action: 'lead.update', entityType: 'Lead', entityId: id, oldValue: lead, newValue: dto });
    return this.getLead(id);
  }

  async moveLead(id: string, stage: LeadStage, actor: AuthUser): Promise<LeadDetailDto> {
    return this.updateLead(id, { stage }, actor);
  }

  /** Creates a client profile for a lead (no app account) so it can be booked or invoiced. */
  async convertLead(id: string, actor: AuthUser): Promise<{ clientId: string }> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw notFound('Lead');
    if (lead.clientId) return { clientId: lead.clientId };
    if (lead.phone) {
      const existing = await this.prisma.client.findUnique({ where: { phone: lead.phone } });
      if (existing) {
        await this.prisma.lead.update({ where: { id }, data: { clientId: existing.id } });
        return { clientId: existing.id };
      }
    }
    const [firstName, ...rest] = lead.name.trim().split(/\s+/);
    const client = await this.prisma.client.create({
      data: {
        firstName: firstName || lead.name,
        lastName: rest.join(' ') || null,
        phone: lead.phone,
        email: lead.email,
        levelId: lead.levelId,
        sourceId: lead.sourceId,
        preferredDays: lead.preferredDays,
        preferredTimes: lead.preferredTimes,
      },
    });
    await this.prisma.lead.update({ where: { id }, data: { clientId: client.id } });
    await this.prisma.clientActivity.create({
      data: { clientId: client.id, type: 'client.created', title: 'Client profile created from CRM lead', actorId: actor.id },
    });
    await this.audit.log({ actor, action: 'lead.convert', entityType: 'Lead', entityId: id, newValue: { clientId: client.id } });
    return { clientId: client.id };
  }

  private async toLeadDtos(rows: LeadRow[]): Promise<LeadDto[]> {
    const clientIds = rows.map((r) => r.clientId).filter((v): v is string => !!v);
    const last = clientIds.length
      ? await this.prisma.clientActivity.groupBy({ by: ['clientId'], where: { clientId: { in: clientIds } }, _max: { createdAt: true } })
      : [];
    const lastMap = new Map(last.map((l) => [l.clientId, l._max.createdAt]));
    return rows.map((l) => ({
      id: l.id,
      clientId: l.clientId,
      name: l.name,
      phone: l.phone,
      email: l.email,
      stage: l.stage,
      stageLabel: STAGE_LABELS[l.stage],
      stageChangedAt: l.stageChangedAt,
      source: l.source,
      assignedTo: l.assignedTo ? { id: l.assignedTo.id, name: l.assignedTo.displayName ?? 'Staff' } : null,
      level: l.level,
      preferredDays: l.preferredDays,
      preferredTimes: l.preferredTimes,
      notes: l.notes,
      lostReason: l.lostReason,
      openTasks: l._count.tasks,
      lastActivityAt: (l.clientId ? lastMap.get(l.clientId) : null) ?? l.updatedAt,
      createdAt: l.createdAt,
    }));
  }

  // ─── Tasks ───

  async listTasks(query: TaskQueryDto, viewer: AuthUser | null): Promise<TaskDto[]> {
    const now = this.clock.now();
    const scope = query.scope ?? 'open';
    const where: Prisma.CrmTaskWhereInput = {
      clientId: query.clientId,
      leadId: query.leadId,
      assignedToId: query.assignee === 'me' ? viewer?.id : query.assignee || undefined,
      ...(scope === 'open' && { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
      ...(scope === 'done' && { status: { in: ['DONE', 'CANCELLED'] } }),
      ...(scope === 'overdue' && { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now } }),
    };
    const rows = await this.prisma.crmTask.findMany({
      where,
      include: taskInclude,
      orderBy: scope === 'done' ? [{ completedAt: 'desc' }] : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
      take: 300,
    });
    return rows.map((t) => this.toTaskDto(t, now));
  }

  async createTask(dto: CreateTaskDto, actor: AuthUser | null, automationRuleId?: string): Promise<TaskDto> {
    const task = await this.prisma.crmTask.create({
      data: {
        title: dto.title,
        description: dto.description,
        clientId: dto.clientId,
        leadId: dto.leadId,
        assignedToId: dto.assignedToId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        priority: dto.priority ?? 'MEDIUM',
        createdById: actor?.id ?? null,
        automationRuleId: automationRuleId ?? null,
      },
      include: taskInclude,
    });
    if (task.clientId) {
      await this.prisma.clientActivity.create({
        data: { clientId: task.clientId, type: 'crm.task', title: `Task created: ${task.title}`, actorId: actor?.id ?? null },
      });
    }
    return this.toTaskDto(task, this.clock.now());
  }

  async updateTask(id: string, dto: UpdateTaskDto, actor: AuthUser): Promise<TaskDto> {
    const before = await this.prisma.crmTask.findUnique({ where: { id } });
    if (!before) throw notFound('Task');
    const done = dto.status === 'DONE' || dto.status === 'CANCELLED';
    const task = await this.prisma.crmTask.update({
      where: { id },
      data: {
        ...dto,
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
        completedAt: dto.status ? (done ? this.clock.now() : null) : undefined,
      },
      include: taskInclude,
    });
    if (dto.status === 'DONE' && task.clientId) {
      await this.prisma.clientActivity.create({
        data: { clientId: task.clientId, type: 'crm.task_done', title: `Task done: ${task.title}`, actorId: actor.id },
      });
    }
    return this.toTaskDto(task, this.clock.now());
  }

  private toTaskDto(t: TaskRow, now: Date): TaskDto {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      isOverdue: !!t.dueAt && t.dueAt < now && (t.status === 'OPEN' || t.status === 'IN_PROGRESS'),
      client: t.client ? { id: t.client.id, name: fullName(t.client.firstName, t.client.lastName), phone: t.client.phone } : null,
      lead: t.lead,
      assignedTo: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.displayName ?? 'Staff' } : null,
      createdBy: t.createdBy ? { id: t.createdBy.id, name: t.createdBy.displayName ?? 'Staff' } : null,
      fromAutomation: !!t.automationRuleId,
      createdAt: t.createdAt,
    };
  }

  // ─── Communications ───

  async communications(filter: { clientId?: string; leadId?: string }): Promise<CommunicationDto[]> {
    const or: Prisma.CommunicationWhereInput[] = [];
    if (filter.clientId) or.push({ clientId: filter.clientId });
    if (filter.leadId) or.push({ leadId: filter.leadId });
    if (!or.length) return [];
    const rows = await this.prisma.communication.findMany({
      where: { OR: or },
      include: { createdBy: { select: { id: true, displayName: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      channel: c.channel,
      direction: c.direction,
      subject: c.subject,
      content: c.content,
      occurredAt: c.occurredAt,
      createdBy: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.displayName ?? 'Staff' } : null,
    }));
  }

  async logCommunication(dto: CreateCommunicationDto, actor: AuthUser): Promise<CommunicationDto[]> {
    if (!dto.clientId && !dto.leadId) throw new DomainError('VALIDATION_FAILED', { message: 'Choose a client or a lead.' });
    let clientId = dto.clientId;
    if (!clientId && dto.leadId) clientId = (await this.prisma.lead.findUnique({ where: { id: dto.leadId } }))?.clientId ?? undefined;
    await this.prisma.communication.create({
      data: {
        clientId,
        leadId: dto.leadId,
        channel: dto.channel,
        direction: dto.direction ?? 'OUTBOUND',
        subject: dto.subject,
        content: dto.content,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : this.clock.now(),
        createdById: actor.id,
      },
    });
    if (clientId) {
      await this.prisma.clientActivity.create({
        data: {
          clientId,
          type: 'crm.communication',
          title: `${dto.channel.replace('_', ' ')} ${dto.direction === 'INBOUND' ? 'from client' : 'to client'}: ${dto.content.slice(0, 80)}`,
          actorId: actor.id,
        },
      });
    }
    return this.communications({ clientId, leadId: dto.leadId });
  }

  // ─── Tags ───

  async tags(): Promise<TagDto[]> {
    const rows = await this.prisma.crmTag.findMany({ include: { _count: { select: { clients: true } } }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, color: t.color, clientCount: t._count.clients }));
  }

  async createTag(dto: CreateTagDto): Promise<TagDto[]> {
    await this.prisma.crmTag.create({ data: dto });
    return this.tags();
  }

  async updateTag(id: string, dto: UpdateTagDto): Promise<TagDto[]> {
    await this.prisma.crmTag.update({ where: { id }, data: dto });
    return this.tags();
  }

  async deleteTag(id: string): Promise<TagDto[]> {
    await this.prisma.crmTag.delete({ where: { id } });
    return this.tags();
  }

  async setClientTags(clientId: string, tagIds: string[], actor: AuthUser): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      await tx.clientTag.deleteMany({ where: { clientId, tagId: { notIn: tagIds } } });
      await tx.clientTag.createMany({ data: tagIds.map((tagId) => ({ clientId, tagId })), skipDuplicates: true });
    });
    await this.audit.log({ actor, action: 'client.tags', entityType: 'Client', entityId: clientId, newValue: { tagIds } });
  }
}
