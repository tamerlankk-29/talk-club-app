import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/auth/auth-user';
import { ActingClient, ActingClientRef, ClientArea, CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import {
  AdminRedeemGiftCertificateDto,
  CancelGiftCertificateDto,
  GiftCertificateDto,
  GiftCertificatePageDto,
  GiftCertificateQueryDto,
  GiftRedeemedDto,
  RedeemGiftCertificateDto,
  SellGiftCertificateDto,
} from './dto/gift-certificate.dto';
import { GiftCertificatesService } from './gift-certificates.service';

@ApiTags('Admin · Gift certificates')
@Controller('admin/gift-certificates')
export class AdminGiftCertificatesController {
  constructor(private readonly gifts: GiftCertificatesService) {}

  @Get()
  @RequirePermissions('payments.view')
  @ApiOperation({ summary: 'Gift certificates sold, redeemed and cancelled' })
  list(@Query() query: GiftCertificateQueryDto): Promise<GiftCertificatePageDto> {
    return this.gifts.list(query);
  }

  @Get(':id')
  @RequirePermissions('payments.view')
  @ApiOperation({ summary: 'One gift certificate (for the detail view and printing)' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GiftCertificateDto> {
    return this.gifts.get(id);
  }

  @Post()
  @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Sell a gift certificate paid at the desk (records the payment)' })
  sell(@Body() dto: SellGiftCertificateDto, @CurrentUser() user: AuthUser): Promise<GiftCertificateDto> {
    return this.gifts.sell(dto, user);
  }

  @Post(':id/redeem')
  @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Redeem a certificate for a client at the desk' })
  redeem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminRedeemGiftCertificateDto, @CurrentUser() user: AuthUser): Promise<GiftRedeemedDto> {
    return this.gifts.redeemForClient(id, dto.clientId, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Cancel an unused certificate (refund the payment separately)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelGiftCertificateDto, @CurrentUser() user: AuthUser): Promise<GiftCertificateDto> {
    return this.gifts.cancel(id, dto.reason, user);
  }
}

@ApiTags('Gift certificates')
@Controller('my/gift-certificates')
export class MyGiftCertificatesController {
  constructor(private readonly gifts: GiftCertificatesService) {}

  @ClientArea()
  @Post('redeem')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Redeem a gift certificate code: the membership starts today' })
  redeem(@ActingClient() acting: ActingClientRef, @Body() dto: RedeemGiftCertificateDto, @CurrentUser() user: AuthUser): Promise<GiftRedeemedDto> {
    return this.gifts.redeem(dto.code, acting.clientId, user);
  }
}
