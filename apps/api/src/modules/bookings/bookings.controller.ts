import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  ActingClient,
  ActingClientRef,
  ClientArea,
  CurrentUser,
  OptionalAuth,
  RequirePermissions,
  ViewerClientId,
} from '../../common/auth/decorators';
import { SessionListQueryDto } from '../sessions/dto/session.dto';
import { BookingsService } from './bookings.service';
import {
  AddParticipantDto,
  AdminBookingPageDto,
  AdminBookingsQueryDto,
  AdminCancelBookingDto,
  AdminSessionDetailDto,
  BookingConfirmationDto,
  BookingDto,
  BookSessionDto,
  CancelBookingDto,
  CancellationPreviewDto,
  CancellationResultDto,
  CancelSessionDto,
  ClientSessionDto,
  MoveBookingDto,
  MyAttendanceDto,
  MyBookingsDto,
  MyBookingsQueryDto,
  SessionCancellationResultDto,
} from './dto/booking.dto';

@ApiTags('Schedule & booking')
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @OptionalAuth()
  @Get('sessions')
  @ApiOperation({
    summary: 'Browse sessions (filters: date, weekday, time of day, level, teacher, format, group type, free seats)',
    description: 'Anonymous callers see the public schedule; signed-in clients also get per-session bookability.',
  })
  schedule(@Query() query: SessionListQueryDto, @ViewerClientId() viewerClientId: string | null): Promise<ClientSessionDto[]> {
    return this.bookings.scheduleForViewer(query, viewerClientId);
  }

  @OptionalAuth()
  @Get('sessions/:id')
  @ApiOperation({ summary: 'Session details (with bookability for signed-in clients)' })
  session(@Param('id', ParseUUIDPipe) id: string, @ViewerClientId() viewerClientId: string | null): Promise<ClientSessionDto> {
    return this.bookings.sessionForViewer(id, viewerClientId);
  }

  @ClientArea()
  @Post('sessions/:id/book')
  @ApiOperation({
    summary: 'Book a session',
    description:
      'Checks membership, remaining visits, validity on the session date, seats, level, duplicates, overlaps and the booking window, then deducts one visit. Errors: BOOKING_* codes.',
  })
  book(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookSessionDto,
    @ActingClient() acting: ActingClientRef,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingConfirmationDto> {
    return this.bookings.book({
      sessionId: id,
      clientId: acting.clientId,
      kind: dto.kind ?? 'MEMBERSHIP',
      source: 'CLIENT',
      actor: { userId: user.id, source: 'CLIENT' },
    });
  }

  @ClientArea()
  @Get('my/bookings')
  @ApiOperation({ summary: 'Upcoming or past bookings (plus active waitlist entries)' })
  myBookings(@ActingClient() acting: ActingClientRef, @Query() query: MyBookingsQueryDto): Promise<MyBookingsDto> {
    return this.bookings.myBookings(acting.clientId, query);
  }

  @ClientArea()
  @Get('my/attendance')
  @ApiOperation({ summary: 'Attendance history with summary (attended, no-shows, cancellations, rate)' })
  myAttendance(@ActingClient() acting: ActingClientRef): Promise<MyAttendanceDto> {
    return this.bookings.myAttendance(acting.clientId);
  }

  @ClientArea()
  @Get('bookings/:id')
  booking(@Param('id', ParseUUIDPipe) id: string, @ActingClient() acting: ActingClientRef): Promise<BookingDto> {
    return this.bookings.getForClient(id, acting.clientId);
  }

  @ClientArea()
  @Get('bookings/:id/cancellation-preview')
  @ApiOperation({ summary: 'What happens if I cancel now? (deadline, whether the visit is returned)' })
  preview(@Param('id', ParseUUIDPipe) id: string, @ActingClient() acting: ActingClientRef): Promise<CancellationPreviewDto> {
    return this.bookings.cancellationPreview(id, acting.clientId);
  }

  @ClientArea()
  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel a booking',
    description:
      'Before the deadline the visit is returned. After it, send acknowledgeLate=true (otherwise 409 BOOKING_LATE_CANCELLATION_CONFIRMATION_REQUIRED) and the visit is not returned.',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @ActingClient() acting: ActingClientRef,
    @CurrentUser() user: AuthUser,
  ): Promise<CancellationResultDto> {
    return this.bookings.cancelByClient(id, acting.clientId, user, dto);
  }

  @ClientArea()
  @Delete('bookings/:id')
  @ApiOperation({ summary: 'Alias of POST /bookings/:id/cancel' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @ActingClient() acting: ActingClientRef,
    @CurrentUser() user: AuthUser,
  ): Promise<CancellationResultDto> {
    return this.bookings.cancelByClient(id, acting.clientId, user, dto ?? {});
  }

  @ClientArea()
  @Get('bookings/:id/calendar.ics')
  @ApiProduces('text/calendar')
  @ApiOperation({ summary: 'Calendar file (Apple Calendar / Outlook / Google import)' })
  async ics(
    @Param('id', ParseUUIDPipe) id: string,
    @ActingClient() acting: ActingClientRef,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, content } = await this.bookings.icsForClient(id, acting.clientId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}

@ApiTags('Admin · Bookings')
@Controller('admin')
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('sessions/:id')
  @RequirePermissions('schedule.view')
  @ApiOperation({ summary: 'Session with participants, attendance, cancellations and waitlist' })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminSessionDetailDto> {
    return this.bookings.adminSessionDetail(id);
  }

  @Post('sessions/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('schedule.manage')
  @ApiOperation({ summary: 'Cancel a session: bookings cancelled without penalty, visits returned, clients notified' })
  cancelSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SessionCancellationResultDto> {
    return this.bookings.cancelSession(id, dto, user);
  }

  @Post('sessions/:id/participants')
  @RequirePermissions('bookings.manage')
  @ApiOperation({ summary: 'Book a client into a session (overrides require bookings.override)' })
  addParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingConfirmationDto> {
    return this.bookings.addParticipant(id, dto, user);
  }

  @Get('bookings')
  @RequirePermissions('bookings.view')
  list(@Query() query: AdminBookingsQueryDto): Promise<AdminBookingPageDto> {
    return this.bookings.listAdmin(query);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('bookings.manage')
  @ApiOperation({ summary: 'Cancel for a client (waivePenalty returns the visit after the deadline)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCancelBookingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CancellationResultDto> {
    return this.bookings.cancelByAdmin(id, dto, user);
  }

  @Post('bookings/:id/move')
  @HttpCode(200)
  @RequirePermissions('bookings.manage')
  @ApiOperation({ summary: 'Move a client to another session (visit returned, new visit used)' })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveBookingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingConfirmationDto> {
    return this.bookings.moveBooking(id, dto, user);
  }
}
