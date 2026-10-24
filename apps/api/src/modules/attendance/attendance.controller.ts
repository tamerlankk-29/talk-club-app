import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { ActingClient, ActingClientRef, ClientArea, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { DomainError } from '../../common/errors/domain-error';
import { AttendanceService } from './attendance.service';
import {
  AttendanceResultDto,
  BulkAttendanceDto,
  CheckinCodeDto,
  CheckinDto,
  CheckinResultDto,
  MarkAttendanceDto,
} from './dto/attendance.dto';

@ApiTags('Attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @ClientArea()
  @Get('my/checkin-code')
  @ApiOperation({ summary: 'Rotating QR check-in token for "My QR code"' })
  code(@ActingClient() acting: ActingClientRef): Promise<CheckinCodeDto> {
    return this.attendance.checkinCode(acting.clientId);
  }

  @Post('attendance/check-in')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Scan a client QR code: marks them present in their current session (teachers: own sessions)' })
  checkin(@Body() dto: CheckinDto, @CurrentUser() user: AuthUser): Promise<CheckinResultDto> {
    if (!user.permissions.has('attendance.manage') && !user.permissions.has('attendance.mark_own')) {
      throw new DomainError('FORBIDDEN');
    }
    return this.attendance.checkin(dto.token, dto.sessionId, user);
  }

  @Post('admin/bookings/:id/attendance')
  @HttpCode(200)
  @RequirePermissions('attendance.manage')
  @ApiOperation({ summary: 'Mark or correct attendance for one booking (audited)' })
  mark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceResultDto> {
    return this.attendance.mark(id, dto.status, user, dto.note);
  }

  @Post('admin/sessions/:id/attendance')
  @HttpCode(200)
  @RequirePermissions('attendance.manage')
  @ApiOperation({ summary: 'Mark attendance for several participants at once' })
  bulk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkAttendanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceResultDto[]> {
    return this.attendance.markBulk(id, dto.items, user);
  }
}
