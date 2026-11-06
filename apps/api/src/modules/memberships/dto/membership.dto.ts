import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BookingStatus, ClientCategory, MembershipTxType, SessionFormat } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MEMBERSHIP_DISPLAY_STATUSES = ['ACTIVE', 'USED_UP', 'EXPIRED', 'CANCELLED', 'NOT_STARTED'] as const;

// ─── Plans ───

export class PlanGroupTypeRefDto {
  id: string;
  name: string;
}

export class MembershipPlanDto {
  id: string;
  programId: string;
  code: string;
  name: string;
  description: string | null;
  visits: number;
  price: number;
  currency: string;
  validityDays: number;
  /** Rounded price per visit, KZT */
  pricePerVisit: number;
  isActive: boolean;
  isPublic: boolean;
  isFeatured: boolean;
  @ApiProperty({ enum: ClientCategory, enumName: 'ClientCategory', isArray: true })
  clientCategories: ClientCategory[];
  @ApiProperty({ enum: SessionFormat, enumName: 'SessionFormat', isArray: true })
  formats: SessionFormat[];
  groupTypes: PlanGroupTypeRefDto[];
  sortOrder: number;
}

export class CreatePlanDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @Matches(/^[A-Z0-9_]{2,30}$/, { message: 'code: UPPER_CASE, e.g. STANDARD' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(500)
  visits: number;

  /** KZT */
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  price: number;

  @IsInt()
  @Min(1)
  @Max(730)
  validityDays: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ enum: ClientCategory, enumName: 'ClientCategory', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ClientCategory, { each: true })
  clientCategories?: ClientCategory[];

  @ApiPropertyOptional({ enum: SessionFormat, enumName: 'SessionFormat', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SessionFormat, { each: true })
  formats?: SessionFormat[];

  /** Restrict the plan to these group types; empty = all */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  groupTypeIds?: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}

// ─── Memberships ───

export class MembershipDto {
  id: string;
  clientId: string;
  planId: string;
  planName: string;
  programId: string;
  @ApiProperty({ enum: MEMBERSHIP_DISPLAY_STATUSES, enumName: 'MembershipDisplayStatus' })
  status: (typeof MEMBERSHIP_DISPLAY_STATUSES)[number];
  /** Visits included in the plan at purchase */
  visitsTotal: number;
  /** Visits credited in total (plan + admin additions/corrections) */
  visitsCredited: number;
  visitsUsed: number;
  visitsRemaining: number;
  price: number;
  currency: string;
  startsAt: Date;
  expiresAt: Date;
  originalExpiresAt: Date;
  /** Last valid day in club time, yyyy-MM-dd */
  expiresOn: string;
  /** Whole days left until expiry (0 on the last day, negative when expired) */
  daysLeft: number;
  isRenewal: boolean;
  paymentId: string | null;
  cancelReason: string | null;
  createdAt: Date;
}

export class LedgerSessionRefDto {
  id: string;
  title: string;
  startsAt: Date;
  teacherName: string | null;
}

export class LedgerBookingRefDto {
  id: string;
  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;
  visitReturned: boolean;
  session: LedgerSessionRefDto;
}

export class MembershipTransactionDto {
  id: string;
  @ApiProperty({ enum: MembershipTxType, enumName: 'MembershipTxType' })
  type: MembershipTxType;
  delta: number;
  balanceAfter: number;
  reason: string | null;
  expiresAtBefore: Date | null;
  expiresAtAfter: Date | null;
  createdAt: Date;
  createdByLabel: string | null;
  booking: LedgerBookingRefDto | null;
}

export class MembershipDetailDto extends MembershipDto {
  transactions: MembershipTransactionDto[];
}

export class MyMembershipOverviewDto {
  /** The membership shown on the home screen (active, expiring first), or null */
  current: MembershipDto | null;
  active: MembershipDto[];
  past: MembershipDto[];
}

// ─── Admin operations (every one requires a reason and is audited) ───

export class GrantMembershipDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  planId: string;

  /** Defaults to now */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  /** Override the plan's visits */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  visits?: number;

  /** Override the plan's validity */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  validityDays?: number;

  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ExtendMembershipDto {
  @IsInt()
  @Min(1)
  @Max(365)
  days: number;

  /** e.g. "Medical/family emergency" or "Administrative correction" */
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class SetExpiryDto {
  /** New last valid day (club time), yyyy-MM-dd */
  @IsDateString({ strict: true })
  expiresOn: string;

  @IsString()
  @Length(3, 500)
  reason: string;
}

export class AdjustVisitsDto {
  /** Positive adds visits, negative removes */
  @IsInt()
  @Min(-100)
  @Max(100)
  @NotEquals(0)
  delta: number;

  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ReasonDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ReturnVisitDto extends ReasonDto {
  @IsUUID()
  bookingId: string;
}

export class MembershipListQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'EXPIRING', 'EXPIRED', 'CANCELLED', 'USED_UP'] })
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED' | 'USED_UP';

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class AdminMembershipRowDto extends MembershipDto {
  clientName: string;
  clientPhone: string | null;
}

export class AdminMembershipPageDto {
  items: AdminMembershipRowDto[];
  total: number;
  page: number;
  pageSize: number;
}
