import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { Interval, ReportsService } from './reports.service';
import { RangeQueryDto, RevenueQueryDto } from './dto/reports-http.dto';
import {
  ClientsReportDto,
  DashboardDto,
  FinanceSummaryDto,
  FunnelReportDto,
  KpisDto,
  MembershipsReportDto,
  RevenueReportDto,
  SessionsReportDto,
  TeacherReportRowDto,
} from './dto/reports-responses.dto';

@ApiTags('Admin · Dashboard & reports')
@Controller('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: "Today at a glance: sessions, bookings, attendance, no-shows, new clients, expiring memberships, revenue" })
  dashboard(@CurrentUser() user: AuthUser): Promise<DashboardDto> {
    return this.reports.dashboard(user);
  }

  @Get('finance/summary')
  @RequirePermissions('finance.view')
  @ApiOperation({ summary: 'Revenue today/week/month, by product and method, outstanding (expected) and refunds' })
  finance(): Promise<FinanceSummaryDto> {
    return this.reports.financeSummary();
  }

  @Get('reports/revenue')
  @RequirePermissions('finance.view')
  async revenue(@Query() query: RevenueQueryDto): Promise<RevenueReportDto> {
    return this.reports.revenue(await this.reports.range(query.from, query.to), query.interval ?? 'day');
  }

  @Get('reports/clients')
  @RequirePermissions('analytics.view')
  async clients(@Query() query: RangeQueryDto): Promise<ClientsReportDto> {
    return this.reports.clients(await this.reports.range(query.from, query.to));
  }

  @Get('reports/memberships')
  @RequirePermissions('analytics.view')
  async memberships(@Query() query: RangeQueryDto): Promise<MembershipsReportDto> {
    return this.reports.memberships(await this.reports.range(query.from, query.to));
  }

  @Get('reports/sessions')
  @RequirePermissions('analytics.view')
  async sessions(@Query() query: RangeQueryDto): Promise<SessionsReportDto> {
    return this.reports.sessions(await this.reports.range(query.from, query.to));
  }

  @Get('reports/teachers')
  @RequirePermissions('analytics.view')
  async teachers(@Query() query: RangeQueryDto, @CurrentUser() user: AuthUser): Promise<TeacherReportRowDto[]> {
    return this.reports.teachers(await this.reports.range(query.from, query.to), user);
  }

  @Get('reports/funnel')
  @RequirePermissions('analytics.view')
  async funnel(@Query() query: RangeQueryDto): Promise<FunnelReportDto> {
    return this.reports.funnel(await this.reports.range(query.from, query.to));
  }

  @Get('analytics/kpis')
  @RequirePermissions('analytics.view')
  @ApiOperation({ summary: 'KPIs: active members, conversions, renewal rate, ARPC, occupancy, no-show/cancellation rates, retention' })
  async kpis(@Query() query: RangeQueryDto): Promise<KpisDto> {
    return this.reports.kpis(await this.reports.range(query.from, query.to));
  }
}
