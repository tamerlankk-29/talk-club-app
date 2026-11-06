import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActorSource, AttendanceMethod, AttendanceStatus, BookingKind, BookingSource, BookingStatus, ClientCategory, WaitlistStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { SessionDto } from '../../sessions/dto/session.dto';

// ─── Bookability (per viewer) ───

export class BookabilityDto {
  canBook: boolean;
  /** Error code explaining why booking is not possible (see API error codes) */
  reason: string | null;
  message: string | null;
  /** Set when the level check is in "warn" mode and the level doesn't match */
  levelWarning: string | null;
  /** Membership that would be used */
  membershipId: string | null;
  membershipName: string | null;
  visitsRemainingAfter: number | null;
  canJoinWaitlist: boolean;
  canBookTrial: boolean;
  trialPrice: number | null;
  freeCancellationAvailable: boolean;
}

export class MyBookingRefDto {
  id: string;
  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;
  @ApiProperty({ enum: BookingKind, enumName: 'BookingKind' })
  kind: BookingKind;
}

export class MyWaitlistRefDto {
  id: string;
  @ApiProperty({ enum: WaitlistStatus, enumName: 'WaitlistStatus' })
  status: WaitlistStatus;
  /** 1-based position among people still waiting */
  position: number;
  offerExpiresAt: Date | null;
}

export class ClientSessionDto extends SessionDto {
  /** Present when the caller is a signed-in client */
  bookability: BookabilityDto | null;
  myBooking: MyBookingRefDto | null;
  myWaitlist: MyWaitlistRefDto | null;
  /** Join link of an online session: only for booked clients, from 15 minutes before the start until it ends */
  onlineUrl: string | null;
  /** When the join link appears (online sessions with a link only) */
  onlineUrlOpensAt: Date | null;
}

// ─── Bookings ───

export class AttendanceRefDto {
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  status: AttendanceStatus;
  @ApiProperty({ enum: AttendanceMethod, enumName: 'AttendanceMethod' })
  method: AttendanceMethod;
  markedAt: Date;
}

export class CancellationInfoDto {
  deadline: Date;
  /** Cancelling now would be a late cancellation */
  isLate: boolean;
  visitWillBeReturned: boolean;
  /** Clients can still cancel (session not started, booking active) */
  canCancel: boolean;
}

export class BookingDto {
  id: string;
  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;
  @ApiProperty({ enum: BookingKind, enumName: 'BookingKind' })
  kind: BookingKind;
  @ApiProperty({ enum: BookingSource, enumName: 'BookingSource' })
  source: BookingSource;
  bookedAt: Date;
  cancelledAt: Date | null;
  @ApiPropertyOptional({ enum: ActorSource, enumName: 'ActorSource', nullable: true })
  cancellationSource: ActorSource | null;
  cancelReason: string | null;
  visitDeducted: boolean;
  visitReturned: boolean;
  membershipId: string | null;
  membershipName: string | null;
  session: SessionDto;
  /** Join link of an online session, from 15 minutes before the start until it ends */
  onlineUrl: string | null;
  /** When the join link appears (online sessions with a link only) */
  onlineUrlOpensAt: Date | null;
  attendance: AttendanceRefDto | null;
  cancellation: CancellationInfoDto | null;
  hasFeedback: boolean;
}

export class WaitlistItemDto {
  id: string;
  @ApiProperty({ enum: WaitlistStatus, enumName: 'WaitlistStatus' })
  status: WaitlistStatus;
  position: number;
  offerExpiresAt: Date | null;
  createdAt: Date;
  session: SessionDto;
}

export class MyBookingsDto {
  items: BookingDto[];
  /** Active waitlist entries (upcoming scope only) */
  waitlist: WaitlistItemDto[];
}

export class MyBookingsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'all'] })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AttendanceSummaryDto {
  attended: number;
  noShows: number;
  cancelled: number;
  lateCancelled: number;
  /** attended / (attended + no-shows) × 100 */
  attendanceRate: number;
}

export class MyAttendanceDto {
  summary: AttendanceSummaryDto;
  items: BookingDto[];
}

// ─── Commands ───

export class BookSessionDto {
  /** MEMBERSHIP (default) uses a visit; TRIAL books the introductory session */
  @ApiPropertyOptional({ enum: ['MEMBERSHIP', 'TRIAL'] })
  @IsOptional()
  @IsIn(['MEMBERSHIP', 'TRIAL'])
  kind?: 'MEMBERSHIP' | 'TRIAL';
}

export class BookingConfirmationDto {
  booking: BookingDto;
  membershipName: string | null;
  visitsRemaining: number | null;
  freeCancellationUntil: Date;
  freeCancellationAvailable: boolean;
  levelWarning: string | null;
  /** For trial bookings: the pending payment to settle */
  trialPaymentId: string | null;
  trialPrice: number | null;
}

export class CancelBookingDto {
  /** Required (true) when cancelling after the free-cancellation deadline */
  @IsOptional()
  @IsBoolean()
  acknowledgeLate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancellationPreviewDto {
  canCancel: boolean;
  isLate: boolean;
  deadline: Date;
  visitWillBeReturned: boolean;
  title: string;
  message: string;
}

export class CancellationResultDto {
  booking: BookingDto;
  visitReturned: boolean;
  isLate: boolean;
  visitsRemaining: number | null;
}

// ─── Admin ───

export class AdminCancelBookingDto {
  /** Return the visit even after the deadline (requires bookings.override) */
  @IsOptional()
  @IsBoolean()
  waivePenalty?: boolean;

  @IsString()
  @Length(3, 500)
  reason: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}

export class AddParticipantDto {
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ enum: BookingKind, enumName: 'BookingKind' })
  @IsOptional()
  @IsEnum(BookingKind)
  kind?: BookingKind;

  /** Specific membership to charge (defaults to the one expiring first) */
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  /** Book even if the session is full (requires bookings.override) */
  @IsOptional()
  @IsBoolean()
  overrideCapacity?: boolean;

  /** Skip level/category/booking-window/overlap rules (requires bookings.override) */
  @IsOptional()
  @IsBoolean()
  overrideRules?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MoveBookingDto {
  @IsUUID()
  targetSessionId: string;

  @IsOptional()
  @IsBoolean()
  overrideCapacity?: boolean;

  @IsOptional()
  @IsBoolean()
  overrideRules?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancelSessionDto {
  @IsString()
  @Length(3, 500)
  reason: string;

  /** Notify booked and waitlisted clients (default true) */
  @IsOptional()
  @IsBoolean()
  notifyClients?: boolean;
}

export class ParticipantClientDto {
  id: string;
  name: string;
  firstName: string;
  phone: string | null;
  photoUrl: string | null;
  @ApiProperty({ enum: ClientCategory, enumName: 'ClientCategory' })
  category: ClientCategory;
  levelName: string | null;
}

export class ParticipantDto {
  bookingId: string;
  client: ParticipantClientDto;
  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;
  @ApiProperty({ enum: BookingKind, enumName: 'BookingKind' })
  kind: BookingKind;
  @ApiProperty({ enum: BookingSource, enumName: 'BookingSource' })
  source: BookingSource;
  bookedAt: Date;
  membershipName: string | null;
  membershipVisitsRemaining: number | null;
  attendance: AttendanceRefDto | null;
  capacityOverride: boolean;
  notes: string | null;
  hasFeedback: boolean;
  /** First ever attended session at the club */
  isFirstVisit: boolean;
  cancelledAt: Date | null;
  cancelReason: string | null;
  visitReturned: boolean;
}

export class WaitlistParticipantDto {
  entryId: string;
  client: ParticipantClientDto;
  @ApiProperty({ enum: WaitlistStatus, enumName: 'WaitlistStatus' })
  status: WaitlistStatus;
  position: number;
  offerExpiresAt: Date | null;
  createdAt: Date;
}

export class AdminSessionDetailDto {
  session: SessionDto;
  onlineUrl: string | null;
  isDetached: boolean;
  cancelReason: string | null;
  attendanceFinalizedAt: Date | null;
  participants: ParticipantDto[];
  cancelled: ParticipantDto[];
  waitlist: WaitlistParticipantDto[];
}

export class AdminBookingRowDto extends BookingDto {
  client: ParticipantClientDto;
}

export class AdminBookingsQueryDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: BookingStatus, enumName: 'BookingStatus' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ enum: BookingKind, enumName: 'BookingKind' })
  @IsOptional()
  @IsEnum(BookingKind)
  kind?: BookingKind;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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

export class AdminBookingPageDto {
  items: AdminBookingRowDto[];
  total: number;
  page: number;
  pageSize: number;
}

export class SessionCancellationResultDto {
  sessionId: string;
  cancelledBookings: number;
  visitsReturned: number;
  waitlistCancelled: number;
}
