import { Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { ActingClient, ActingClientRef, ClientArea, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { BookingConfirmationDto, MyWaitlistRefDto } from '../bookings/dto/booking.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('Waitlist')
@Controller()
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @ClientArea()
  @Post('sessions/:id/waitlist')
  @ApiOperation({ summary: 'Join the waitlist of a full session' })
  join(@Param('id', ParseUUIDPipe) id: string, @ActingClient() acting: ActingClientRef): Promise<MyWaitlistRefDto> {
    return this.waitlist.join(id, acting.clientId);
  }

  @ClientArea()
  @Delete('sessions/:id/waitlist')
  @ApiOperation({ summary: 'Leave the waitlist' })
  async leave(@Param('id', ParseUUIDPipe) id: string, @ActingClient() acting: ActingClientRef): Promise<OkResponseDto> {
    await this.waitlist.leave(id, acting.clientId);
    return { ok: true };
  }

  @ClientArea()
  @Post('waitlist/:id/claim')
  @HttpCode(200)
  @ApiOperation({ summary: 'Book the place offered from the waitlist ("BOOK THE PLACE")' })
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @ActingClient() acting: ActingClientRef,
    @CurrentUser() user: AuthUser,
  ): Promise<BookingConfirmationDto> {
    return this.waitlist.claim(id, acting.clientId, user);
  }

  @Delete('admin/waitlist/:id')
  @RequirePermissions('bookings.manage')
  @ApiOperation({ summary: 'Remove someone from a waitlist' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.waitlist.removeByAdmin(id, user);
    return { ok: true };
  }
}
