import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { ActingClient, ActingClientRef, ClientArea, CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import {
  AdminPaymentDto,
  AdminPaymentPageDto,
  CancelPaymentDto,
  ConfirmPaymentDto,
  CreatePaymentMethodDto,
  CreatePaymentRequestDto,
  MockCompleteDto,
  PaymentDto,
  PaymentListQueryDto,
  PaymentMethodDto,
  PurchaseMembershipDto,
  RefundPaymentDto,
  UpdatePaymentMethodDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('public/payment-methods')
  @ApiOperation({ summary: 'Payment methods available in the client app' })
  methods(): Promise<PaymentMethodDto[]> {
    return this.payments.methods(true);
  }

  @ClientArea()
  @Post('payments')
  @ApiOperation({ summary: 'Buy a membership: accepts the public offer and creates a pending payment' })
  purchase(
    @ActingClient() acting: ActingClientRef,
    @CurrentUser() user: AuthUser,
    @Body() dto: PurchaseMembershipDto,
  ): Promise<PaymentDto> {
    return this.payments.purchase(acting.clientId, user.id, dto);
  }

  @ClientArea()
  @Get('my/payments')
  @ApiOperation({ summary: 'Payment history (pending, confirmed, refunded)' })
  myPayments(@ActingClient() acting: ActingClientRef): Promise<PaymentDto[]> {
    return this.payments.listForClient(acting.clientId);
  }

  @ClientArea()
  @Get('my/payments/:id')
  myPayment(@ActingClient() acting: ActingClientRef, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentDto> {
    return this.payments.getForClient(acting.clientId, id);
  }

  @ClientArea()
  @Post('my/payments/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel your own pending membership payment' })
  cancelMine(@ActingClient() acting: ActingClientRef, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentDto> {
    return this.payments.cancelByClient(acting.clientId, id);
  }

  @ClientArea()
  @Post('payments/mock/:id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Development only: complete the test checkout (simulates the provider webhook)' })
  completeMock(
    @ActingClient() acting: ActingClientRef,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MockCompleteDto,
  ): Promise<PaymentDto> {
    return this.payments.completeMock(id, acting.clientId, dto.result);
  }

  @Public()
  @Post('payments/webhooks/:provider')
  @HttpCode(200)
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiOperation({ summary: 'Payment provider callback (signature verified by the provider adapter)' })
  webhook(@Param('provider') provider: string, @Body() body: unknown, @Req() req: Request) {
    return this.payments.handleWebhook(provider, body, req.headers as Record<string, string | undefined>);
  }
}

@ApiTags('Admin · Payments')
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  @RequirePermissions('payments.view')
  @ApiOperation({ summary: 'Payments with filters and totals (paid vs pending)' })
  list(@Query() query: PaymentListQueryDto): Promise<AdminPaymentPageDto> {
    return this.payments.listAdmin(query);
  }

  @Get('payments/:id')
  @RequirePermissions('payments.view')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminPaymentDto> {
    return this.payments.getAdmin(id);
  }

  @Post('payments')
  @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Create a payment request (e.g. Kaspi invoice) or record a received payment' })
  create(@Body() dto: CreatePaymentRequestDto, @CurrentUser() user: AuthUser): Promise<AdminPaymentDto> {
    return this.payments.createRequest(dto, user);
  }

  @Post('payments/:id/confirm')
  @HttpCode(200)
  @RequirePermissions('payments.manage')
  @ApiOperation({ summary: 'Confirm a pending payment — activates the membership automatically' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminPaymentDto> {
    return this.payments.confirm(id, dto, user);
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('payments.manage')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminPaymentDto> {
    return this.payments.cancel(id, dto.reason, user);
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  @RequirePermissions('payments.refund')
  @ApiOperation({ summary: 'Refund a payment (full or partial), optionally cancelling the membership' })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminPaymentDto> {
    return this.payments.refund(id, dto.amount, dto.reason, dto.cancelMembership ?? false, user);
  }

  @Get('payment-methods')
  @RequirePermissions('payments.view')
  methods(): Promise<PaymentMethodDto[]> {
    return this.payments.methods(false);
  }

  @Post('payment-methods')
  @RequirePermissions('settings.manage')
  createMethod(@Body() dto: CreatePaymentMethodDto, @CurrentUser() user: AuthUser): Promise<PaymentMethodDto> {
    return this.payments.createMethod(dto, user);
  }

  @Patch('payment-methods/:id')
  @RequirePermissions('settings.manage')
  updateMethod(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaymentMethodDto> {
    return this.payments.updateMethod(id, dto, user);
  }
}
