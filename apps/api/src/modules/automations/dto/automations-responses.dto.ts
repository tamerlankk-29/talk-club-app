import { ApiProperty } from '@nestjs/swagger';
import { AutomationRunStatus, AutomationTrigger } from '@prisma/client';
import { SegmentFieldDto } from '../../segments/dto/segments-responses.dto';

export class TriggerMetaDto {
  @ApiProperty({ enum: AutomationTrigger, enumName: 'AutomationTrigger' })
  trigger: AutomationTrigger;
  label: string;
  /** Name of the numeric trigger parameter, if any (daysBefore, remaining, days) */
  config: string | null;
  @ApiProperty({ enum: ['event', 'schedule'] })
  kind: 'event' | 'schedule';
}

export class TemplateRefDto {
  key: string;
  name: string;
}

export class AutomationMetaDto {
  triggers: TriggerMetaDto[];
  conditionFields: SegmentFieldDto[];
  actionTypes: string[];
  templates: TemplateRefDto[];
}

export class AutomationStatsDto {
  completed: number;
  skipped: number;
  failed: number;
  scheduled: number;
}

export class AutomationRuleDto {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  @ApiProperty({ enum: AutomationTrigger, enumName: 'AutomationTrigger' })
  trigger: AutomationTrigger;
  @ApiProperty({ type: 'object', additionalProperties: true })
  triggerConfig: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  conditions: Array<Record<string, unknown>>;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  actions: Array<Record<string, unknown>>;
  delayMinutes: number;
  isActive: boolean;
  isSystem: boolean;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
  stats?: AutomationStatsDto;
}

export class AutomationRunRuleRefDto {
  name: string;
}

export class AutomationRunClientRefDto {
  id: string;
  firstName: string;
  lastName: string | null;
}

export class AutomationRunDto {
  id: string;
  ruleId: string;
  clientId: string | null;
  dedupeKey: string;
  @ApiProperty({ enum: AutomationRunStatus, enumName: 'AutomationRunStatus' })
  status: AutomationRunStatus;
  scheduledFor: Date;
  executedAt: Date | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  result: unknown;
  error: string | null;
  createdAt: Date;
  rule: AutomationRunRuleRefDto;
  client: AutomationRunClientRefDto | null;
}
