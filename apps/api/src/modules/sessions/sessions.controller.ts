import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import {
  CreateSessionDto,
  CreateSessionTemplateDto,
  DeactivateTemplateQueryDto,
  DuplicateResultDto,
  DuplicateSessionDto,
  SessionAdminDto,
  SessionListQueryDto,
  SessionTemplateDto,
  TemplateGenerationResultDto,
  UpdateSessionDto,
  UpdateSessionTemplateDto,
} from './dto/session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('Admin · Schedule')
@Controller('admin')
export class AdminSessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('sessions')
  @RequirePermissions('schedule.view')
  @ApiOperation({ summary: 'Sessions in a date range (calendar day/week/month views)' })
  list(@Query() query: SessionListQueryDto): Promise<SessionAdminDto[]> {
    return this.sessions.listAdmin(query);
  }

  @Post('sessions')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Create a session (room and teacher conflicts are rejected)' })
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: AuthUser): Promise<SessionAdminDto> {
    return this.sessions.create(dto, user);
  }

  @Patch('sessions/:id')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Edit / move / change teacher, room or capacity / close booking' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SessionAdminDto> {
    return this.sessions.update(id, dto, user);
  }

  @Post('sessions/:id/duplicate')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Copy a session to other dates' })
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DuplicateResultDto> {
    return this.sessions.duplicate(id, dto, user);
  }

  // ─── Recurring schedule ───

  @Get('session-templates')
  @RequirePermissions('schedule.view')
  @ApiOperation({ summary: 'Recurring schedule rules' })
  templates(): Promise<SessionTemplateDto[]> {
    return this.sessions.listTemplates();
  }

  @Post('session-templates')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Create a recurring schedule (e.g. Mon/Wed/Fri 18:30) and generate sessions' })
  createTemplate(@Body() dto: CreateSessionTemplateDto, @CurrentUser() user: AuthUser): Promise<TemplateGenerationResultDto> {
    return this.sessions.createTemplate(dto, user);
  }

  @Patch('session-templates/:id')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Edit a recurring schedule; future unedited occurrences follow' })
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionTemplateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TemplateGenerationResultDto> {
    return this.sessions.updateTemplate(id, dto, user);
  }

  @Post('session-templates/:id/generate')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Generate occurrences up to the configured horizon' })
  async generate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<TemplateGenerationResultDto> {
    const result = await this.sessions.generate(id, user.id);
    return { ...result, updated: 0, removed: 0 };
  }

  @Delete('session-templates/:id')
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Stop a recurring schedule (optionally remove future sessions without bookings)' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeactivateTemplateQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TemplateGenerationResultDto> {
    return this.sessions.deactivateTemplate(id, query.removeFuture ?? false, user);
  }
}
