import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CommunicationChannel, CommunicationDirection, LeadStage, TaskPriority, TaskStatus, TimeOfDay } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// ─── Shared refs ───

export class NamedRefDto {
  id: string;
  name: string;
}

export class LeadTrialDto {
  id: string;
  status: string;
  outcome: string;
  sessionStartsAt: Date | null;
  createdAt: Date;
}

export class TaskClientRefDto {
  id: string;
  name: string;
  phone: string | null;
}

// ─── Leads ───

export class LeadDto {
  id: string;
  clientId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage' })
  stage: LeadStage;
  stageLabel: string;
  stageChangedAt: Date;
  source: NamedRefDto | null;
  assignedTo: NamedRefDto | null;
  level: NamedRefDto | null;
  preferredDays: number[];
  @ApiProperty({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  preferredTimes: TimeOfDay[];
  notes: string | null;
  lostReason: string | null;
  openTasks: number;
  lastActivityAt: Date | null;
  createdAt: Date;
}

export class LeadDetailDto extends LeadDto {
  trials: LeadTrialDto[];
  communications: CommunicationDto[];
  tasks: TaskDto[];
}

export class PipelineColumnDto {
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage' })
  stage: LeadStage;
  label: string;
  count: number;
  leads: LeadDto[];
}

export class LeadQueryDto {
  @ApiPropertyOptional({ enum: LeadStage, enumName: 'LeadStage' })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perStage?: number;
}

export class CreateLeadDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  preferredDays?: number[];

  @ApiPropertyOptional({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TimeOfDay, { each: true })
  preferredTimes?: TimeOfDay[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @ApiPropertyOptional({ enum: LeadStage, enumName: 'LeadStage' })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lostReason?: string;
}

// ─── Tasks ───

export class TaskDto {
  id: string;
  title: string;
  description: string | null;
  @ApiProperty({ enum: TaskStatus, enumName: 'TaskStatus' })
  status: TaskStatus;
  @ApiProperty({ enum: TaskPriority, enumName: 'TaskPriority' })
  priority: TaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  isOverdue: boolean;
  client: TaskClientRefDto | null;
  lead: NamedRefDto | null;
  assignedTo: NamedRefDto | null;
  createdBy: NamedRefDto | null;
  fromAutomation: boolean;
  createdAt: Date;
}

export class TaskQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'done', 'all', 'overdue'] })
  @IsOptional()
  @IsIn(['open', 'done', 'all', 'overdue'])
  scope?: 'open' | 'done' | 'all' | 'overdue';

  /** "me" or a user id */
  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;
}

export class CreateTaskDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ enum: TaskPriority, enumName: 'TaskPriority' })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({ enum: TaskStatus, enumName: 'TaskStatus' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

// ─── Communications ───

export class CommunicationDto {
  id: string;
  @ApiProperty({ enum: CommunicationChannel, enumName: 'CommunicationChannel' })
  channel: CommunicationChannel;
  @ApiProperty({ enum: CommunicationDirection, enumName: 'CommunicationDirection' })
  direction: CommunicationDirection;
  subject: string | null;
  content: string;
  occurredAt: Date;
  createdBy: NamedRefDto | null;
}

export class CreateCommunicationDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ enum: CommunicationChannel, enumName: 'CommunicationChannel' })
  @IsEnum(CommunicationChannel)
  channel: CommunicationChannel;

  @ApiPropertyOptional({ enum: CommunicationDirection, enumName: 'CommunicationDirection' })
  @IsOptional()
  @IsEnum(CommunicationDirection)
  direction?: CommunicationDirection;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @Length(1, 5000)
  content: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

// ─── Tags ───

export class TagDto {
  id: string;
  name: string;
  color: string | null;
  clientCount: number;
}

export class CreateTagDto {
  @IsString()
  @Length(1, 40)
  name: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}

export class ConvertLeadResultDto {
  clientId: string;
}
