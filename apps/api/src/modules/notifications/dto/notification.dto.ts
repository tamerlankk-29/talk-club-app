import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus, NotificationCategory, NotificationChannel } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class NotificationItemDto {
  id: string;
  @ApiProperty({ enum: NotificationCategory, enumName: 'NotificationCategory' })
  category: NotificationCategory;
  templateKey: string | null;
  title: string;
  body: string;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  secondaryButtonLabel: string | null;
  secondaryButtonUrl: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export class InboxDto {
  items: NotificationItemDto[];
  unreadCount: number;
}

export class UnreadCountDto {
  unreadCount: number;
}

export class InboxQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Cursor: return notifications created before this ISO timestamp */
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  /** CLIENT = everything except staff alerts; STAFF = admin notification center */
  @ApiPropertyOptional({ enum: ['CLIENT', 'STAFF', 'TRANSACTIONAL', 'REMINDER', 'MARKETING'] })
  @IsOptional()
  @IsIn(['CLIENT', 'STAFF', 'TRANSACTIONAL', 'REMINDER', 'MARKETING'])
  category?: 'CLIENT' | 'STAFF' | 'TRANSACTIONAL' | 'REMINDER' | 'MARKETING';
}

export class PushKeysDto {
  @IsString()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @MaxLength(100)
  auth: string;
}

export class PushSubscriptionDto {
  @IsString()
  @MaxLength(1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint: string;
}

export class PushPublicKeyDto {
  /** VAPID public key (null when push is not configured) */
  publicKey: string | null;
}

export class ChannelPrefsDto {
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() telegram?: boolean;
}

export class UpdatePreferencesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPrefsDto)
  channels?: ChannelPrefsDto;

  /** Session and membership reminders */
  @IsOptional()
  @IsBoolean()
  reminders?: boolean;

  /** Marketing messages (news, offers) */
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}

export class ChannelPrefsStateDto {
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  telegram: boolean;
}

export class PreferencesDto {
  channels: ChannelPrefsStateDto;
  reminders: boolean;
  marketing: boolean;
  /** Number of devices subscribed to push */
  pushSubscriptions: number;
  /** The account phone is linked to the Telegram bot */
  telegramLinked: boolean;
  /** Link that opens the bot to connect Telegram (null when the bot is not set up) */
  telegramBotUrl: string | null;
}

export class NotificationTemplateDto {
  id: string | null;
  key: string;
  name: string;
  description: string | null;
  @ApiProperty({ enum: NotificationCategory, enumName: 'NotificationCategory' })
  category: NotificationCategory;
  title: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  secondaryButtonLabel: string | null;
  secondaryButtonUrl: string | null;
  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  channels: NotificationChannel[];
  isActive: boolean;
  /** Placeholders available in this template */
  placeholders: string[];
  /** Differs from the built-in default */
  isCustomized: boolean;
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  buttonLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  buttonUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  secondaryButtonLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  secondaryButtonUrl?: string | null;

  @ApiPropertyOptional({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DeliveryQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus, enumName: 'DeliveryStatus' })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional({ enum: NotificationChannel, enumName: 'NotificationChannel' })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class DeliveryDto {
  id: string;
  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel' })
  channel: NotificationChannel;
  @ApiProperty({ enum: DeliveryStatus, enumName: 'DeliveryStatus' })
  status: DeliveryStatus;
  provider: string | null;
  error: string | null;
  attempts: number;
  sentAt: Date | null;
  createdAt: Date;
  title: string;
  recipient: string | null;
}
