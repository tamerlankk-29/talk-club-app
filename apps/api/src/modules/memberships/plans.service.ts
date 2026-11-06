import { Injectable } from '@nestjs/common';
import { ClientCategory, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { notFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { CreatePlanDto, MembershipPlanDto, UpdatePlanDto } from './dto/membership.dto';

const planInclude = { groupTypes: { include: { groupType: true } } } satisfies Prisma.MembershipPlanInclude;
type PlanRow = Prisma.MembershipPlanGetPayload<{ include: typeof planInclude }>;

export function toPlanDto(p: PlanRow): MembershipPlanDto {
  return {
    id: p.id,
    programId: p.programId,
    code: p.code,
    name: p.name,
    description: p.description,
    visits: p.visits,
    price: p.price,
    currency: p.currency,
    validityDays: p.validityDays,
    pricePerVisit: Math.round(p.price / Math.max(1, p.visits)),
    isActive: p.isActive,
    isPublic: p.isPublic,
    isFeatured: p.isFeatured,
    clientCategories: p.clientCategories,
    formats: p.formats,
    groupTypes: p.groupTypes.map((g) => ({ id: g.groupType.id, name: g.groupType.name })),
    sortOrder: p.sortOrder,
  };
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  /** Plans a client can buy (optionally filtered by their category). */
  async listPurchasable(category?: ClientCategory | null): Promise<MembershipPlanDto[]> {
    const program = await this.catalog.defaultProgram();
    const rows = await this.prisma.membershipPlan.findMany({
      where: { programId: program.id, isActive: true, isPublic: true },
      include: planInclude,
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
    return rows
      .filter((p) => !category || !p.clientCategories.length || p.clientCategories.includes(category))
      .map(toPlanDto);
  }

  async listAll(): Promise<MembershipPlanDto[]> {
    const rows = await this.prisma.membershipPlan.findMany({
      include: planInclude,
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
    return rows.map(toPlanDto);
  }

  async get(id: string): Promise<MembershipPlanDto> {
    const row = await this.prisma.membershipPlan.findUnique({ where: { id }, include: planInclude });
    if (!row) throw notFound('Plan');
    return toPlanDto(row);
  }

  async create(dto: CreatePlanDto, actor: AuthUser): Promise<MembershipPlanDto> {
    const programId = dto.programId ?? (await this.catalog.defaultProgram()).id;
    const { groupTypeIds, ...data } = dto;
    const row = await this.prisma.membershipPlan.create({
      data: {
        ...data,
        programId,
        groupTypes: groupTypeIds?.length ? { create: groupTypeIds.map((groupTypeId) => ({ groupTypeId })) } : undefined,
      },
      include: planInclude,
    });
    await this.audit.log({ actor, action: 'plan.create', entityType: 'MembershipPlan', entityId: row.id, newValue: dto });
    return toPlanDto(row);
  }

  /** Changes apply to future purchases only — sold memberships keep their snapshot. */
  async update(id: string, dto: UpdatePlanDto, actor: AuthUser): Promise<MembershipPlanDto> {
    const before = await this.prisma.membershipPlan.findUnique({ where: { id }, include: planInclude });
    if (!before) throw notFound('Plan');
    const { groupTypeIds, ...data } = dto;
    const row = await this.prisma.transaction(async (tx) => {
      if (groupTypeIds) {
        await tx.membershipPlanGroupType.deleteMany({ where: { planId: id } });
        if (groupTypeIds.length) {
          await tx.membershipPlanGroupType.createMany({ data: groupTypeIds.map((groupTypeId) => ({ planId: id, groupTypeId })) });
        }
      }
      return tx.membershipPlan.update({ where: { id }, data, include: planInclude });
    });
    await this.audit.log({
      actor,
      action: 'plan.update',
      entityType: 'MembershipPlan',
      entityId: id,
      oldValue: toPlanDto(before),
      newValue: toPlanDto(row),
    });
    return toPlanDto(row);
  }
}
