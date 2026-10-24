import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BroadcastKind, BroadcastStatus, NotificationChannel } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class BroadcastStatsDto {
  sent: number;
  skipped: number;
  failed: number;
  read: number;
}

export class BroadcastDto {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  @ApiProperty({ enum: BroadcastKind, enumName: 'BroadcastKind' })
  kind: BroadcastKind;
  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  channels: NotificationChannel[];
  segmentId: string | null;
  segmentName: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  audience: unknown;
  scheduledAt: Date | null;
  @ApiProperty({ enum: BroadcastStatus, enumName: 'BroadcastStatus' })
  status: BroadcastStatus;
  sentAt: Date | null;
  recipientCount: number;
  stats: BroadcastStatsDto;
  createdAt: Date;
}

export class CreateBroadcastDto {
  @IsString()
  @Length(1, 120)
  title: string;

  @IsString()
  @Length(1, 2000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  buttonLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  buttonUrl?: string | null;

  /** MARKETING goes only to clients who opted in; SERVICE (e.g. "club closed tomorrow") goes to everyone in the audience */
  @ApiPropertyOptional({ enum: BroadcastKind, enumName: 'BroadcastKind' })
  @IsOptional()
  @IsEnum(BroadcastKind)
  kind?: BroadcastKind;

  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(NotificationChannel, { each: true })
  channels: NotificationChannel[];

  /** Saved segment… */
  @IsOptional()
  @IsUUID()
  segmentId?: string | null;

  /** …or an ad-hoc audience definition */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown> | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}

export class UpdateBroadcastDto extends PartialType(CreateBroadcastDto) {}

export class ScheduleBroadcastDto {
  @IsDateString()
  scheduledAt: string;
}

export class AudiencePreviewDto {
  @IsOptional()
  @IsUUID()
  segmentId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: BroadcastKind, enumName: 'BroadcastKind' })
  @IsOptional()
  @IsEnum(BroadcastKind)
  kind?: BroadcastKind;
}

export class AnnouncementDto {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  audience: unknown;
  isPinned: boolean;
  isActive: boolean;
  createdAt: Date;
}

export class CreateAnnouncementDto {
  @IsString()
  @Length(1, 120)
  title: string;

  @IsString()
  @Length(1, 3000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  buttonLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  buttonUrl?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  /** Target audience (segment definition); empty = everyone */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class AudiencePreviewResultDto {
  /** Clients matching the audience */
  total: number;
  /** Clients who will actually receive it (marketing consent applied) */
  reachable: number;
}
