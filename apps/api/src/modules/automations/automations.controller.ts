import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { AutomationTrigger } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { DEFAULT_TEMPLATES } from '../notifications/default-templates';
import { SEGMENT_FIELDS } from '../segments/segment-rules';
import { TRIGGER_META } from './automation.types';
import { AutomationsService } from './automations.service';
import { CreateRuleDto, UpdateRuleDto, RunsQueryDto } from './dto/automations-http.dto';
import { AutomationMetaDto, AutomationRuleDto, AutomationRunDto } from './dto/automations-responses.dto';

@ApiTags('Admin · Automations')
@Controller('admin/automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get('meta')
  @RequirePermissions('automations.manage')
  @ApiOperation({ summary: 'Triggers, condition fields, action types and templates for the rule builder' })
  meta(): AutomationMetaDto {
    return {
      triggers: TRIGGER_META,
      conditionFields: SEGMENT_FIELDS,
      actionTypes: ['SEND_NOTIFICATION', 'CREATE_TASK', 'ADD_TAG', 'SET_LEAD_STAGE'],
      templates: DEFAULT_TEMPLATES.filter((t) => t.category !== 'STAFF').map((t) => ({ key: t.key, name: t.name })),
    };
  }

  @Get()
  @RequirePermissions('automations.manage')
  @ApiOperation({ summary: 'Automation rules with run statistics' })
  list(): Promise<AutomationRuleDto[]> {
    return this.automations.list() as unknown as Promise<AutomationRuleDto[]>;
  }

  @Post()
  @RequirePermissions('automations.manage')
  create(@Body() dto: CreateRuleDto, @CurrentUser() user: AuthUser): Promise<AutomationRuleDto> {
    return this.automations.create(dto, user) as unknown as Promise<AutomationRuleDto>;
  }

  @Patch(':id')
  @RequirePermissions('automations.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto, @CurrentUser() user: AuthUser): Promise<AutomationRuleDto> {
    return this.automations.update(id, dto, user) as unknown as Promise<AutomationRuleDto>;
  }

  @Delete(':id')
  @RequirePermissions('automations.manage')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.automations.remove(id, user);
    return { ok: true };
  }

  @Get('runs')
  @RequirePermissions('automations.manage')
  @ApiOperation({ summary: 'Recent automation runs (completed, skipped, failed, scheduled)' })
  runs(@Query() query: RunsQueryDto): Promise<AutomationRunDto[]> {
    return this.automations.runs(query.ruleId, query.limit) as unknown as Promise<AutomationRunDto[]>;
  }
}
