import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { AutomationTrigger } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export class CreateRuleDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: AutomationTrigger, enumName: 'AutomationTrigger' })
  @IsEnum(AutomationTrigger)
  trigger: AutomationTrigger;

  /** e.g. { "daysBefore": 3 } for MEMBERSHIP_EXPIRING */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  /** Segment rules the client must match, e.g. [{ field: "hasActiveMembership", op: "eq", value: false }] */
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsOptional()
  @IsArray()
  conditions?: unknown[];

  /** e.g. [{ type: "SEND_NOTIFICATION", templateKey: "membership.expiring" }] */
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsArray()
  actions: unknown[];

  /** Wait before running (e.g. 1440 = 24 hours after the trigger) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 24 * 30)
  delayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: AutomationTrigger, enumName: 'AutomationTrigger' })
  @IsOptional()
  @IsEnum(AutomationTrigger)
  trigger?: AutomationTrigger;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsOptional()
  @IsArray()
  conditions?: unknown[];

  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsOptional()
  @IsArray()
  actions?: unknown[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 24 * 30)
  delayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RunsQueryDto {
  @IsOptional()
  @IsUUID()
  ruleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
