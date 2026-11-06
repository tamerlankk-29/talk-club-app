import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { TimeOfDay, TrialOutcome, TrialStatus } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { TrialsService } from './trials.service';
import { TrialRequestDto, TrialRequestResultDto, TrialQueryDto, ScheduleTrialDto, TrialAttendanceDto, TrialOutcomeDto, CancelTrialDto } from './dto/trials-http.dto';
import { TrialDto } from './dto/trials-responses.dto';

@ApiTags('Trials')
@Controller()
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('public/trial-requests')
  @ApiOperation({ summary: 'Request a trial session (name, phone, level, preferred day/time)' })
  request(@Body() dto: TrialRequestDto): Promise<TrialRequestResultDto> {
    return this.trials.request(dto);
  }

  @Get('admin/trials')
  @RequirePermissions('trials.manage')
  list(@Query() query: TrialQueryDto): Promise<TrialDto[]> {
    return this.trials.list(query.status);
  }

  @Get('admin/trials/:id')
  @RequirePermissions('trials.manage')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TrialDto> {
    return this.trials.get(id);
  }

  @Post('admin/trials/:id/schedule')
  @HttpCode(200)
  @RequirePermissions('trials.manage', 'bookings.manage')
  @ApiOperation({ summary: 'Assign the trial to a session (creates the client profile and a pending 1,500 KZT payment)' })
  schedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleTrialDto, @CurrentUser() user: AuthUser): Promise<TrialDto> {
    return this.trials.schedule(id, dto.sessionId, user, dto.overrideCapacity);
  }

  @Post('admin/trials/:id/attendance')
  @HttpCode(200)
  @RequirePermissions('trials.manage', 'attendance.manage')
  attendance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TrialAttendanceDto, @CurrentUser() user: AuthUser): Promise<TrialDto> {
    return this.trials.markAttendance(id, dto.attended, user);
  }

  @Post('admin/trials/:id/outcome')
  @HttpCode(200)
  @RequirePermissions('trials.manage')
  @ApiOperation({ summary: 'Record the outcome: interested / not interested / membership purchased' })
  outcome(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TrialOutcomeDto, @CurrentUser() user: AuthUser): Promise<TrialDto> {
    return this.trials.setOutcome(id, dto.outcome, dto.notes, user);
  }

  @Post('admin/trials/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('trials.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTrialDto, @CurrentUser() user: AuthUser): Promise<TrialDto> {
    return this.trials.cancel(id, dto.reason, user);
  }
}
