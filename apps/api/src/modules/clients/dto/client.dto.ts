import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ClientCategory, ClientStatus, FormatPreference, LeadStage, TimeOfDay } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MembershipDto } from '../../memberships/dto/membership.dto';

export class ClientNamedRefDto {
  id: string;
  name: string;
}

export class ClientLevelRefDto {
  id: string;
  name: string;
  rank: number;
}

export class ClientNextBookingDto {
  id: string;
  startsAt: Date;
  title: string;
  teacherName: string | null;
}

export class ClientAccountDto {
  hasAccount: boolean;
  lastLoginAt: Date | null;
  phoneVerified: boolean;
  hasPassword: boolean;
}

export class ClientLeadRefDto {
  id: string;
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage' })
  stage: LeadStage;
  stageLabel: string;
  source: string | null;
}

export class ClientUpcomingBookingDto {
  id: string;
  sessionId: string;
  startsAt: Date;
  title: string;
  teacherName: string | null;
  kind: string;
}

export class ClientRecentBookingDto extends ClientUpcomingBookingDto {
  status: string;
  visitReturned: boolean;
}

export class ClientPaymentRowDto {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  method: string;
  createdAt: Date;
  paidAt: Date | null;
}

export class ClientTrialRowDto {
  id: string;
  status: string;
  outcome: string;
  createdAt: Date;
}

export class GuardianDto {
  userId: string;
  name: string;
  phone: string | null;
  relationship: string | null;
}

export class ClientReferralDto {
  code: string | null;
  referredBy: ClientNamedRefDto | null;
  referralsMade: number;
}

export class ConsentDto {
  documentType: string;
  version: number;
  acceptedAt: Date;
  context: string;
}

export class ClientTagRefDto {
  id: string;
  name: string;
  color: string | null;
}

export class ClientMembershipSummaryDto {
  id: string;
  planName: string;
  visitsRemaining: number;
  visitsTotal: number;
  expiresAt: Date;
  expiresOn: string;
  status: string;
}

export class ClientListItemDto {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  @ApiProperty({ enum: ClientCategory, enumName: 'ClientCategory' })
  category: ClientCategory;
  level: ClientNamedRefDto | null;
  @ApiProperty({ enum: ClientStatus, enumName: 'ClientStatus' })
  status: ClientStatus;
  hasAccount: boolean;
  membership: ClientMembershipSummaryDto | null;
  lastVisitAt: Date | null;
  nextBooking: ClientNextBookingDto | null;
  totalVisits: number;
  tags: ClientTagRefDto[];
  @ApiPropertyOptional({ enum: LeadStage, enumName: 'LeadStage', nullable: true })
  leadStage: LeadStage | null;
  source: ClientNamedRefDto | null;
  createdAt: Date;
}

export class ClientListPageDto {
  items: ClientListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export class ClientListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ClientCategory, enumName: 'ClientCategory' })
  @IsOptional()
  @IsEnum(ClientCategory)
  category?: ClientCategory;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @IsUUID()
  segmentId?: string;

  @ApiPropertyOptional({ enum: ['active', 'expiring', 'expired', 'none'] })
  @IsOptional()
  @IsIn(['active', 'expiring', 'expired', 'none'])
  membership?: 'active' | 'expiring' | 'expired' | 'none';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ANONYMIZED'] })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ enum: ['name', 'createdAt', 'lastVisitAt', 'expiresAt'] })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'lastVisitAt', 'expiresAt'])
  sort?: 'name' | 'createdAt' | 'lastVisitAt' | 'expiresAt';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ClientProfileDto {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  @ApiProperty({ enum: ClientCategory, enumName: 'ClientCategory' })
  category: ClientCategory;
  level: ClientLevelRefDto | null;
  preferredDays: number[];
  @ApiProperty({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  preferredTimes: TimeOfDay[];
  @ApiProperty({ enum: FormatPreference, enumName: 'FormatPreference' })
  formatPreference: FormatPreference;
  preferredTeachers: ClientNamedRefDto[];
  marketingConsent: boolean;
  registeredAt: Date;
}

export class ActivityDto {
  id: string;
  type: string;
  title: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  data: unknown;
  actorLabel: string | null;
  createdAt: Date;
}

export class CreateClientDto {
  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string;

  @ApiPropertyOptional({ enum: ClientCategory, enumName: 'ClientCategory' })
  @IsOptional()
  @IsEnum(ClientCategory)
  category?: ClientCategory;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  preferredDays?: number[];

  @ApiPropertyOptional({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TimeOfDay, { each: true })
  preferredTimes?: TimeOfDay[];

  @ApiPropertyOptional({ enum: FormatPreference, enumName: 'FormatPreference' })
  @IsOptional()
  @IsEnum(FormatPreference)
  formatPreference?: FormatPreference;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {
  /** Reason recorded in the level history when the level changes */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  levelReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string | null;
}

export class AddNoteDto {
  @IsString()
  @Length(1, 5000)
  text: string;
}

export class LinkGuardianDto {
  /** Phone of the parent's Talk Club account */
  @IsString()
  @MaxLength(32)
  guardianPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;
}

export class ClientDetailDto {
  profile: ClientProfileDto;
  @ApiProperty({ enum: ClientStatus, enumName: 'ClientStatus' })
  status: ClientStatus;
  notes: string | null;
  account: ClientAccountDto | null;
  lead: ClientLeadRefDto | null;
  tags: ClientTagRefDto[];
  memberships: MembershipDto[];
  currentMembership: MembershipDto | null;
  upcomingBookings: ClientUpcomingBookingDto[];
  recentBookings: ClientRecentBookingDto[];
  payments: ClientPaymentRowDto[];
  trials: ClientTrialRowDto[];
  openTasks: number;
  guardians: GuardianDto[];
  children: ClientNamedRefDto[];
  referral: ClientReferralDto;
  consents: ConsentDto[];
  deletionRequestedAt: Date | null;
}

export class DataRequestUserDto {
  displayName: string | null;
  phone: string | null;
}

export class DataRequestDto {
  id: string;
  @ApiProperty({ enum: ['EXPORT', 'DELETION'] })
  type: 'EXPORT' | 'DELETION';
  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'REJECTED'] })
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  /** The client's own explanation, if any */
  reason: string | null;
  clientId: string | null;
  clientName: string | null;
  user: DataRequestUserDto;
  createdAt: Date;
  processedAt: Date | null;
}
