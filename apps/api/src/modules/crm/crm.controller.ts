import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsUUID } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { CrmService } from './crm.service';
import {
  CommunicationDto,
  CreateCommunicationDto,
  CreateLeadDto,
  CreateTagDto,
  CreateTaskDto,
  LeadDetailDto,
  LeadDto,
  LeadQueryDto,
  PipelineColumnDto,
  TagDto,
  TaskDto,
  TaskQueryDto,
  UpdateLeadDto,
  UpdateTagDto,
  UpdateTaskDto,
} from './dto/crm.dto';
import { MoveLeadDto, ClientTagsDto, CommunicationQueryDto } from './dto/crm-http.dto';
import { ConvertLeadResultDto } from './dto/crm.dto';

@ApiTags('Admin · CRM')
@Controller('admin')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('crm/pipeline')
  @RequirePermissions('crm.view')
  @ApiOperation({ summary: 'Funnel board: leads grouped by stage (new lead → … → renewed / inactive)' })
  pipeline(@Query() query: LeadQueryDto): Promise<PipelineColumnDto[]> {
    return this.crm.pipelineBoard(query);
  }

  @Get('leads')
  @RequirePermissions('crm.view')
  leads(@Query() query: LeadQueryDto): Promise<LeadDto[]> {
    return this.crm.listLeads(query);
  }

  @Get('leads/:id')
  @RequirePermissions('crm.view')
  lead(@Param('id', ParseUUIDPipe) id: string): Promise<LeadDetailDto> {
    return this.crm.getLead(id);
  }

  @Post('leads')
  @RequirePermissions('crm.manage')
  @ApiOperation({ summary: 'Add a lead (Instagram DM, call, walk-in…)' })
  createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser): Promise<LeadDetailDto> {
    return this.crm.createLead(dto, user);
  }

  @Patch('leads/:id')
  @RequirePermissions('crm.manage')
  updateLead(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser): Promise<LeadDetailDto> {
    return this.crm.updateLead(id, dto, user);
  }

  @Post('leads/:id/move')
  @HttpCode(200)
  @RequirePermissions('crm.manage')
  @ApiOperation({ summary: 'Move a lead to another funnel stage (drag & drop)' })
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveLeadDto, @CurrentUser() user: AuthUser): Promise<LeadDetailDto> {
    return this.crm.moveLead(id, dto.stage, user);
  }

  @Post('leads/:id/convert')
  @HttpCode(200)
  @RequirePermissions('crm.manage')
  @ApiOperation({ summary: 'Create a client profile for this lead (to book a trial or send an invoice)' })
  convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<ConvertLeadResultDto> {
    return this.crm.convertLead(id, user);
  }

  @Get('tasks')
  @RequirePermissions('crm.view')
  tasks(@Query() query: TaskQueryDto, @CurrentUser() user: AuthUser): Promise<TaskDto[]> {
    return this.crm.listTasks(query, user);
  }

  @Post('tasks')
  @RequirePermissions('crm.manage')
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser): Promise<TaskDto> {
    return this.crm.createTask(dto, user);
  }

  @Patch('tasks/:id')
  @RequirePermissions('crm.manage')
  updateTask(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: AuthUser): Promise<TaskDto> {
    return this.crm.updateTask(id, dto, user);
  }

  @Get('communications')
  @RequirePermissions('crm.view')
  communications(@Query() query: CommunicationQueryDto): Promise<CommunicationDto[]> {
    return this.crm.communications({ clientId: query.clientId });
  }

  @Post('communications')
  @RequirePermissions('crm.manage')
  @ApiOperation({ summary: 'Log a conversation (WhatsApp, call, Instagram, in person…)' })
  logCommunication(@Body() dto: CreateCommunicationDto, @CurrentUser() user: AuthUser): Promise<CommunicationDto[]> {
    return this.crm.logCommunication(dto, user);
  }

  @Get('tags')
  @RequirePermissions('clients.view')
  tags(): Promise<TagDto[]> {
    return this.crm.tags();
  }

  @Post('tags')
  @RequirePermissions('crm.manage')
  createTag(@Body() dto: CreateTagDto): Promise<TagDto[]> {
    return this.crm.createTag(dto);
  }

  @Patch('tags/:id')
  @RequirePermissions('crm.manage')
  updateTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto): Promise<TagDto[]> {
    return this.crm.updateTag(id, dto);
  }

  @Delete('tags/:id')
  @RequirePermissions('crm.manage')
  deleteTag(@Param('id', ParseUUIDPipe) id: string): Promise<TagDto[]> {
    return this.crm.deleteTag(id);
  }

  @Put('clients/:id/tags')
  @RequirePermissions('clients.manage')
  async setTags(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClientTagsDto, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.crm.setClientTags(id, dto.tagIds, user);
    return { ok: true };
  }
}
