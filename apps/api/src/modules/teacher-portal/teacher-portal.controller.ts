import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceResultDto, BulkAttendanceDto, MarkAttendanceDto } from '../attendance/dto/attendance.dto';
import { TeacherPortalService } from './teacher-portal.service';
import { TeacherSessionsQueryDto } from './dto/teacher-portal-http.dto';
import { TeacherProfileDto, TeacherSessionDetailDto, TeacherSessionDto } from './dto/teacher-portal-responses.dto';

@ApiTags('Teacher panel')
@Controller('teacher')
@RequirePermissions('teacher.portal')
export class TeacherPortalController {
  constructor(
    private readonly portal: TeacherPortalService,
    private readonly attendance: AttendanceService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Teacher profile and monthly stats' })
  me(@CurrentUser() user: AuthUser): Promise<TeacherProfileDto> {
    return this.portal.profile(user);
  }

  @Get('sessions')
  @ApiOperation({ summary: "Own sessions: today (default), this week, upcoming or past" })
  sessions(@CurrentUser() user: AuthUser, @Query() query: TeacherSessionsQueryDto): Promise<TeacherSessionDto[]> {
    return this.portal.sessions(user, query.scope ?? 'today', query.date);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Session participants with attendance and feedback (no payment data)' })
  session(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TeacherSessionDetailDto> {
    return this.portal.session(user, id);
  }

  @Post('sessions/:id/attendance')
  @HttpCode(200)
  @RequirePermissions('attendance.mark_own')
  @ApiOperation({ summary: 'Mark attendance for several participants' })
  bulk(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BulkAttendanceDto): Promise<AttendanceResultDto[]> {
    return this.attendance.markBulk(id, dto.items, user);
  }

  @Post('sessions/:id/attendance/all-present')
  @HttpCode(200)
  @RequirePermissions('attendance.mark_own')
  @ApiOperation({ summary: 'Mark every unmarked participant as present' })
  allPresent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AttendanceResultDto[]> {
    return this.attendance.markAll(id, 'PRESENT', user);
  }

  @Post('bookings/:id/attendance')
  @HttpCode(200)
  @RequirePermissions('attendance.mark_own')
  @ApiOperation({ summary: 'One-click attendance: PRESENT / LATE / ABSENT' })
  mark(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkAttendanceDto): Promise<AttendanceResultDto> {
    return this.attendance.mark(id, dto.status, user, dto.note);
  }
}
