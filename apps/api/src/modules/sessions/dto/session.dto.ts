import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SessionFormat, TimeOfDay } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SESSION_DISPLAY_STATUSES = ['SCHEDULED', 'OPEN', 'ALMOST_FULL', 'FULL', 'STARTED', 'COMPLETED', 'CANCELLED'] as const;
export type SessionDisplayStatusValue = (typeof SESSION_DISPLAY_STATUSES)[number];

const toBool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

// ─── Response ───

export class SessionTeacherRefDto {
  id: string;
  name: string;
  photoUrl: string | null;
  country: string | null;
  headline: string | null;
}

export class RefDto {
  id: string;
  name: string;
}

export class LevelRefDto {
  id: string;
  name: string;
  rank: number;
}

export class GroupTypeRefDto {
  id: string;
  name: string;
  color: string | null;
}

export class SessionLocationRefDto {
  id: string;
  name: string;
  address: string;
  addressDetails: string | null;
  timezone: string;
}

export class SessionDto {
  id: string;
  programId: string;
  /** Display title: custom title, else group type name */
  title: string;
  topic: string | null;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Club-local calendar date, yyyy-MM-dd */
  localDate: string;
  /** Club-local HH:mm */
  startTime: string;
  endTime: string;
  durationMinutes: number;
  /** ISO weekday 1 (Mon) … 7 (Sun), club time */
  weekday: number;
  @ApiProperty({ enum: SessionFormat, enumName: 'SessionFormat' })
  format: SessionFormat;
  @ApiProperty({ enum: SESSION_DISPLAY_STATUSES, enumName: 'SessionDisplayStatus' })
  status: SessionDisplayStatusValue;
  bookingClosed: boolean;
  capacity: number;
  /** Seats taken by active bookings */
  booked: number;
  /** Seats reserved for waitlist offers */
  held: number;
  /** Seats bookable right now */
  available: number;
  waitlistCount: number;
  teacher: SessionTeacherRefDto | null;
  room: RefDto | null;
  location: SessionLocationRefDto;
  groupType: GroupTypeRefDto | null;
  levelMin: LevelRefDto | null;
  levelMax: LevelRefDto | null;
  /** e.g. "Pre-Intermediate+" or "Elementary – Intermediate" */
  levelLabel: string;
  trialsAllowed: boolean;
  /** Last moment for free cancellation under the current policy */
  cancellationDeadline: Date;
  templateId: string | null;
}

export class SessionAdminDto extends SessionDto {
  isDetached: boolean;
  cancelReason: string | null;
  onlineUrl: string | null;
  attendanceFinalizedAt: Date | null;
  /** Non-blocking issues found when saving (outside working hours, room too small, …) */
  warnings: string[];
}

// ─── Queries ───

export class SessionListQueryDto {
  /** Start of range (inclusive), ISO date or date-time. Defaults to now. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** End of range (exclusive). Defaults to from + 14 days. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** A single club-local day, yyyy-MM-dd (overrides from/to) */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsUUID()
  groupTypeId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({ enum: SessionFormat, enumName: 'SessionFormat' })
  @IsOptional()
  @IsEnum(SessionFormat)
  format?: SessionFormat;

  @ApiPropertyOptional({ enum: TimeOfDay, enumName: 'TimeOfDay' })
  @IsOptional()
  @IsEnum(TimeOfDay)
  timeOfDay?: TimeOfDay;

  /** ISO weekday 1–7 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  /** Only sessions with free seats */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  availableOnly?: boolean;

  /** Only sessions matching the signed-in client's level */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  matchMyLevel?: boolean;

  /** Include cancelled sessions (admin views) */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeCancelled?: boolean;
}

// ─── Create / update ───

export class CreateSessionDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @IsUUID()
  groupTypeId?: string | null;

  @IsOptional()
  @IsUUID()
  levelMinId?: string | null;

  @IsOptional()
  @IsUUID()
  levelMaxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string | null;

  /** Club-local date yyyy-MM-dd */
  @IsDateString({ strict: true })
  date: string;

  /** Club-local HH:mm */
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;

  /** Defaults to the configured session duration (90) */
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  /** Defaults to the configured group size (7) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;

  @ApiPropertyOptional({ enum: SessionFormat, enumName: 'SessionFormat' })
  @IsOptional()
  @IsEnum(SessionFormat)
  format?: SessionFormat;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  onlineUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  bookingClosed?: boolean;

  @IsOptional()
  @IsBoolean()
  trialsAllowed?: boolean;
}

export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  /** Allow capacity below the current number of bookings */
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  /** Notify booked clients about time/teacher/room changes (default true) */
  @IsOptional()
  @IsBoolean()
  notifyClients?: boolean;
}

export class DuplicateSessionDto {
  /** Target dates (club-local yyyy-MM-dd) */
  @IsArray()
  @ArrayMinSize(1)
  @IsDateString({ strict: true }, { each: true })
  dates: string[];

  /** Optional new start time */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;
}

export class DuplicateResultDto {
  created: SessionAdminDto[];
  skipped: SkippedOccurrenceDto[];
}

export class SkippedOccurrenceDto {
  date: string;
  reason: string;
}

// ─── Templates (recurring schedule) ───

export class SessionTemplateDto {
  id: string;
  programId: string;
  locationId: string;
  roomId: string | null;
  teacherId: string | null;
  groupTypeId: string | null;
  levelMinId: string | null;
  levelMaxId: string | null;
  title: string | null;
  description: string | null;
  daysOfWeek: number[];
  startTime: string;
  durationMinutes: number;
  capacity: number;
  @ApiProperty({ enum: SessionFormat, enumName: 'SessionFormat' })
  format: SessionFormat;
  onlineUrl: string | null;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  generatedUntil: string | null;
  teacherName: string | null;
  roomName: string | null;
  levelLabel: string;
  groupTypeName: string | null;
  upcomingCount: number;
}

export class CreateSessionTemplateDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @IsUUID()
  groupTypeId?: string | null;

  @IsOptional()
  @IsUUID()
  levelMinId?: string | null;

  @IsOptional()
  @IsUUID()
  levelMaxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string | null;

  /** ISO weekdays, e.g. [1,3,5] for Mon/Wed/Fri */
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek: number[];

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;

  @ApiPropertyOptional({ enum: SessionFormat, enumName: 'SessionFormat' })
  @IsOptional()
  @IsEnum(SessionFormat)
  format?: SessionFormat;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  onlineUrl?: string | null;

  /** yyyy-MM-dd, defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  validFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSessionTemplateDto extends PartialType(CreateSessionTemplateDto) {
  /** Also update future (not individually edited) occurrences. Default true. */
  @IsOptional()
  @IsBoolean()
  applyToFuture?: boolean;
}

export class TemplateGenerationResultDto {
  template: SessionTemplateDto;
  created: number;
  updated: number;
  removed: number;
  skipped: SkippedOccurrenceDto[];
}

export class DeactivateTemplateQueryDto {
  /** Remove future occurrences that have no bookings */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  removeFuture?: boolean;
}

export class TimeOfDayFilter {
  @IsIn(['MORNING', 'AFTERNOON', 'EVENING'])
  value: 'MORNING' | 'AFTERNOON' | 'EVENING';
}
