import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { fullName } from '../../common/utils/names';
import { normalizePhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { GlobalSearchQueryDto } from './dto/search-http.dto';
import { SearchResultDto } from './search.dto';

@ApiTags('Admin · Search')
@Controller('admin/search')
export class SearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  @RequirePermissions('clients.view')
  @ApiOperation({ summary: 'Global search: clients (name, phone, email), leads, teachers, payments (reference), memberships' })
  async search(@Query() query: GlobalSearchQueryDto, @CurrentUser() user: AuthUser): Promise<SearchResultDto> {
    const q = query.q.trim();
    const phone = normalizePhone(q);
    const [clients, leads, teachers, payments, memberships] = await Promise.all([
      this.prisma.client.findMany({
        where: { AND: [{ status: { not: 'ANONYMIZED' } }, this.clients.searchWhere(q)] },
        include: { level: { select: { name: true } } },
        take: 8,
        orderBy: { lastVisitAt: { sort: 'desc', nulls: 'last' } },
      }),
      user.permissions.has('crm.view')
        ? this.prisma.lead.findMany({
            where: { clientId: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(phone ? [{ phone }] : [])] },
            take: 5,
          })
        : Promise.resolve([]),
      this.prisma.teacher.findMany({
        where: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] },
        take: 5,
      }),
      user.permissions.has('payments.view')
        ? this.prisma.payment.findMany({
            where: { reference: { contains: q, mode: 'insensitive' } },
            include: { client: { select: { firstName: true, lastName: true } } },
            take: 5,
          })
        : Promise.resolve([]),
      user.permissions.has('memberships.view')
        ? this.prisma.membership.findMany({
            where: { planName: { contains: q, mode: 'insensitive' }, status: 'ACTIVE' },
            include: { client: { select: { id: true, firstName: true, lastName: true } } },
            take: 5,
          })
        : Promise.resolve([]),
    ]);
    return {
      clients: clients.map((c) => ({ id: c.id, name: fullName(c.firstName, c.lastName), phone: c.phone, email: c.email, level: c.level?.name ?? null, status: c.status })),
      leads: leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone, stage: l.stage })),
      teachers: teachers.map((t) => ({ id: t.id, name: fullName(t.firstName, t.lastName), isActive: t.isActive })),
      payments: payments.map((p) => ({ id: p.id, reference: p.reference, amount: p.amount, status: p.status, client: fullName(p.client.firstName, p.client.lastName) })),
      memberships: memberships.map((m) => ({ id: m.id, planName: m.planName, visitsRemaining: m.visitsRemaining, client: { id: m.client.id, name: fullName(m.client.firstName, m.client.lastName) } })),
    };
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
