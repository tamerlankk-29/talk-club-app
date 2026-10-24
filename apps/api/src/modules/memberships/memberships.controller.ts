import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  ActingClient,
  ActingClientRef,
  ClientArea,
  CurrentUser,
  OptionalAuth,
  RequirePermissions,
  ViewerClientId,
} from '../../common/auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdjustVisitsDto,
  AdminMembershipPageDto,
  CreatePlanDto,
  ExtendMembershipDto,
  GrantMembershipDto,
  MembershipDetailDto,
  MembershipListQueryDto,
  MembershipPlanDto,
  MyMembershipOverviewDto,
  ReasonDto,
  ReturnVisitDto,
  SetExpiryDto,
  UpdatePlanDto,
} from './dto/membership.dto';
import { MembershipsService } from './memberships.service';
import { PlansService } from './plans.service';

@ApiTags('Memberships')
@Controller()
export class MembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly plans: PlansService,
    private readonly prisma: PrismaService,
  ) {}

  @OptionalAuth()
  @Get('membership-plans')
  @ApiOperation({ summary: 'Membership plans available for purchase (filtered by the client category when signed in)' })
  async listPlans(@ViewerClientId() viewerClientId: string | null): Promise<MembershipPlanDto[]> {
    const client = viewerClientId
      ? await this.prisma.client.findUnique({ where: { id: viewerClientId }, select: { category: true } })
      : null;
    return this.plans.listPurchasable(client?.category);
  }

  @ClientArea()
  @Get('my/membership')
  @ApiOperation({ summary: 'Current membership (remaining visits, expiry) plus active and past memberships' })
  myMembership(@ActingClient() acting: ActingClientRef): Promise<MyMembershipOverviewDto> {
    return this.memberships.overviewForClient(acting.clientId);
  }

  @ClientArea()
  @Get('my/memberships/:id')
  @ApiOperation({ summary: 'Membership with its full visit ledger (which visit was used for which session)' })
  myMembershipDetail(
    @ActingClient() acting: ActingClientRef,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MembershipDetailDto> {
    return this.memberships.detailForClient(acting.clientId, id);
  }
}

@ApiTags('Admin · Memberships')
@Controller('admin')
export class AdminMembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly plans: PlansService,
  ) {}

  // ─── Plans ───

  @Get('membership-plans')
  @RequirePermissions('memberships.view')
  listPlans(): Promise<MembershipPlanDto[]> {
    return this.plans.listAll();
  }

  @Post('membership-plans')
  @RequirePermissions('plans.manage')
  @ApiOperation({ summary: 'Create a plan (name, visits, price, validity, availability, categories)' })
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUser): Promise<MembershipPlanDto> {
    return this.plans.create(dto, user);
  }

  @Patch('membership-plans/:id')
  @RequirePermissions('plans.manage')
  @ApiOperation({ summary: 'Edit a plan — applies to future purchases only' })
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MembershipPlanDto> {
    return this.plans.update(id, dto, user);
  }

  // ─── Memberships ───

  @Get('memberships')
  @RequirePermissions('memberships.view')
  @ApiOperation({ summary: 'Memberships with filters (active, expiring, expired, used up, cancelled)' })
  list(@Query() query: MembershipListQueryDto): Promise<AdminMembershipPageDto> {
    return this.memberships.listAdmin(query);
  }

  @Get('memberships/:id')
  @RequirePermissions('memberships.view')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MembershipDetailDto> {
    return this.memberships.detailById(id);
  }

  @Post('memberships')
  @RequirePermissions('memberships.manage')
  @ApiOperation({ summary: 'Grant a membership without payment (reason required, audited)' })
  grant(@Body() dto: GrantMembershipDto, @CurrentUser() user: AuthUser): Promise<MembershipDetailDto> {
    return this.memberships.grant(dto, user);
  }

  @Post('memberships/:id/extend')
  @RequirePermissions('memberships.manage')
  @ApiOperation({ summary: 'Extend the expiry by N days (e.g. medical emergency)' })
  extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendMembershipDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MembershipDetailDto> {
    return this.memberships.extend(id, dto.days, dto.reason, user);
  }

  @Post('memberships/:id/expiry')
  @RequirePermissions('memberships.manage')
  @ApiOperation({ summary: 'Set a specific expiry date' })
  setExpiry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetExpiryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MembershipDetailDto> {
    return this.memberships.setExpiry(id, dto.expiresOn, dto.reason, user);
  }

  @Post('memberships/:id/adjust-visits')
  @RequirePermissions('memberships.manage')
  @ApiOperation({ summary: 'Add or remove visits (creates a ledger entry, never edits the balance directly)' })
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustVisitsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MembershipDetailDto> {
    return this.memberships.adjustVisits(id, dto.delta, dto.reason, user);
  }

  @Post('memberships/return-visit')
  @RequirePermissions('memberships.manage')
  @ApiOperation({ summary: 'Return the visit of a late-cancelled or no-show booking' })
  returnVisit(@Body() dto: ReturnVisitDto, @CurrentUser() user: AuthUser): Promise<MembershipDetailDto> {
    return this.memberships.returnVisit(dto.bookingId, dto.reason, user);
  }

  @Post('memberships/:id/cancel')
  @RequirePermissions('memberships.manage')
  @ApiOperation({ summary: 'Cancel a membership (refunds are handled on the payment)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MembershipDetailDto> {
    return this.memberships.cancel(id, dto.reason, user);
  }
}
