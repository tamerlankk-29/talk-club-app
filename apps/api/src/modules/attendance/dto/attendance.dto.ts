import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class MarkAttendanceDto {
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class BulkAttendanceItemDto {
  @IsUUID()
  bookingId: string;

  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}

export class BulkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceItemDto)
  items: BulkAttendanceItemDto[];
}

export class AttendanceResultDto {
  bookingId: string;
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  status: AttendanceStatus;
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus', nullable: true })
  previousStatus: AttendanceStatus | null;
  clientName: string;
}

export class CheckinDto {
  /** Token from the client's QR code */
  @IsString()
  @MaxLength(2000)
  token: string;

  /** Limit the check-in to this session */
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

export class CheckinResultDto extends AttendanceResultDto {
  sessionId: string;
  sessionTitle: string;
  startTime: string;
}

export class CheckinCodeDto {
  /** Encode this in the QR code */
  token: string;
  expiresAt: Date;
  /** Refresh the code after this many seconds */
  refreshInSeconds: number;
}
