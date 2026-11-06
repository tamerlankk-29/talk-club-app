import { ApiProperty } from '@nestjs/swagger';
import { LeadStage, ProductType } from '@prisma/client';
import { SessionDto } from '../../sessions/dto/session.dto';

// ─── Dashboard ───

export class DashboardTodayDto {
  sessions: number;
  bookings: number;
  attended: number;
  noShows: number;
  cancellations: number;
  lateCancellations: number;
  capacity: number;
  /** Booked seats / capacity, % */
  occupancy: number;
}

export class DashboardClientsDto {
  active: number;
  newThisWeek: number;
  newTrialsThisWeek: number;
  membershipsExpiringSoon: number;
}

export class DashboardPendingDto {
  payments: number;
  paymentsAmount: number;
}

export class DashboardTasksDto {
  open: number;
  overdue: number;
}

export class ActivityClientRefDto {
  id: string;
  name: string;
}

export class RecentActivityDto {
  id: string;
  type: string;
  title: string;
  createdAt: Date;
  client: ActivityClientRefDto;
}

export class RevenuePeriodsDto {
  today: number;
  week: number;
  month: number;
}

export class ProductAmountDto {
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  productType: ProductType;
  amount: number;
  count: number;
}

export class MethodAmountDto {
  method: string;
  code: string;
  amount: number;
  count: number;
}

export class AmountCountDto {
  amount: number;
  count: number;
}

export class RefundsDto {
  month: number;
  count: number;
}

export class FinanceSummaryDto {
  revenue: RevenuePeriodsDto;
  monthByProduct: ProductAmountDto[];
  monthByMethod: MethodAmountDto[];
  /** Expected revenue: payment requests not confirmed yet */
  outstanding: AmountCountDto;
  refunds: RefundsDto;
}

export class DashboardDto {
  date: string;
  today: DashboardTodayDto;
  clients: DashboardClientsDto;
  pending: DashboardPendingDto;
  tasks: DashboardTasksDto;
  waitlist: number;
  unmarkedAttendance: number;
  deletionRequests: number;
  /** Null without finance.view */
  finance: FinanceSummaryDto | null;
  sessions: SessionDto[];
  recentActivity: RecentActivityDto[];
}

// ─── Revenue ───

export class RevenuePointDto {
  /** Period start, yyyy-MM-dd (club time) */
  period: string;
  revenue: number;
  refunds: number;
  net: number;
  count: number;
}

export class LabelAmountDto {
  label: string;
  amount: number;
  count: number;
}

export class ProductBreakdownDto extends LabelAmountDto {
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  productType: ProductType;
}

export class RevenueTotalsDto {
  revenue: number;
  refunds: number;
  net: number;
  count: number;
  pending: number;
  pendingCount: number;
}

export class RevenueReportDto {
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  interval: 'day' | 'week' | 'month';
  from: Date;
  to: Date;
  series: RevenuePointDto[];
  byProduct: ProductBreakdownDto[];
  byMethod: LabelAmountDto[];
  totals: RevenueTotalsDto;
}

// ─── Clients / memberships / sessions / teachers ───

export class LabelCountDto {
  label: string;
  count: number;
}

export class PeriodCountDto {
  period: string;
  count: number;
}

export class ClientsReportDto {
  newClients: number;
  activeClients: number;
  inactiveClients: number;
  totalClients: number;
  returningClients: number;
  newByWeek: PeriodCountDto[];
  bySource: LabelCountDto[];
  byCategory: LabelCountDto[];
  byLevel: LabelCountDto[];
}

export class PlanSalesDto {
  label: string;
  count: number;
  revenue: number;
}

export class MembershipsReportDto {
  sold: number;
  active: number;
  expired: number;
  renewed: number;
  renewalRate: number;
  byPlan: PlanSalesDto[];
}

export class SessionTotalsDto {
  attended: number;
  noShows: number;
  cancelled: number;
  lateCancelled: number;
}

export class WeekdayStatDto {
  weekday: number;
  sessions: number;
  attended: number;
}

export class TimeStatDto {
  time: string;
  sessions: number;
  attended: number;
}

export class SessionsReportDto {
  sessionsHeld: number;
  sessionsCancelled: number;
  averageAttendance: number;
  capacityUtilization: number;
  cancellationRate: number;
  lateCancellationRate: number;
  noShowRate: number;
  totals: SessionTotalsDto;
  byWeekday: WeekdayStatDto[];
  byTime: TimeStatDto[];
}

export class TeacherReportRowDto {
  teacherId: string;
  name: string;
  sessions: number;
  attended: number;
  averageAttendance: number;
  utilization: number;
  noShowRate: number;
  feedbackGiven: number;
  /** Sessions × session rate (only with teachers.view_rates) */
  payout: number | null;
}

// ─── Funnel & KPIs ───

export class FunnelStepDto {
  key: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
}

export class PipelineStageCountDto {
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage' })
  stage: LeadStage;
  label: string;
  count: number;
}

export class FunnelReportDto {
  steps: FunnelStepDto[];
  trialsRequested: number;
  pipeline: PipelineStageCountDto[];
}

export class LabelAmountOnlyDto {
  label: string;
  amount: number;
}

export class KpisDto {
  from: Date;
  to: Date;
  activeMembers: number;
  newRegistrations: number;
  /** % of attended trials that led to a membership */
  trialConversion: number;
  /** % of registrations that bought a first membership */
  membershipConversion: number;
  /** Renewals / memberships that expired in the period, % */
  renewalRate: number;
  averageRevenuePerClient: number;
  averageVisitsPerClient: number;
  sessionOccupancy: number;
  noShowRate: number;
  cancellationRate: number;
  /** Clients active in the previous period who are still active, % */
  clientRetention: number;
  revenue: number;
  revenuePerSession: number;
  revenueByMembership: LabelAmountOnlyDto[];
}
