import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { ActingClient, ActingClientRef, ClientArea, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { DomainError } from '../../common/errors/domain-error';
import { SettingsService } from '../settings/settings.service';
import { FeedbackService } from './feedback.service';
import { FeedbackBodyDto, FeedbackQueryDto } from './dto/feedback-http.dto';
import { FeedbackDto, ProgressDto } from './dto/feedback-responses.dto';

@ApiTags('Feedback & progress')
@Controller()
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly settings: SettingsService,
  ) {}

  @Put('teacher/bookings/:id/feedback')
  @RequirePermissions('feedback.write')
  @ApiOperation({ summary: 'Teacher feedback for a participant (participation, fluency, vocabulary, confidence 1–5 + comment)' })
  upsert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FeedbackBodyDto, @CurrentUser() user: AuthUser): Promise<FeedbackDto> {
    return this.feedback.upsert(id, dto, user);
  }

  @Put('admin/bookings/:id/feedback')
  @RequirePermissions('attendance.manage')
  adminUpsert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FeedbackBodyDto, @CurrentUser() user: AuthUser): Promise<FeedbackDto> {
    return this.feedback.upsert(id, dto, user);
  }

  @Get('admin/feedback')
  @RequirePermissions('feedback.view')
  list(@Query() query: FeedbackQueryDto): Promise<FeedbackDto[]> {
    return this.feedback.list(query);
  }

  @ClientArea()
  @Get('my/feedback')
  @ApiOperation({ summary: 'Feedback history from teachers' })
  async mine(@ActingClient() acting: ActingClientRef): Promise<FeedbackDto[]> {
    const cfg = await this.settings.get('feedback');
    if (!cfg.visibleToClients) return [];
    return this.feedback.forClient(acting.clientId, true);
  }

  @ClientArea()
  @Get('my/progress')
  @ApiOperation({ summary: 'Speaking progress: average scores, monthly trend and level history' })
  async progress(@ActingClient() acting: ActingClientRef): Promise<ProgressDto> {
    const cfg = await this.settings.get('feedback');
    if (!cfg.enabled) throw new DomainError('FEEDBACK_DISABLED');
    return this.feedback.progress(acting.clientId, true);
  }
}
