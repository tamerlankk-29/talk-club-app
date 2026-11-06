import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaymentStatus, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PaymentMethodDto {
  id: string;
  code: string;
  name: string;
  provider: string;
  instructions: string | null;
  isActive: boolean;
  availableToClients: boolean;
  /** The provider adapter is configured and usable */
  providerReady: boolean;
  sortOrder: number;
}

export class PaymentMethodRefDto {
  code: string;
  name: string;
}

export class PaymentPlanRefDto {
  id: string;
  name: string;
  visits: number;
  validityDays: number;
}

export class PersonRefDto {
  id: string;
  name: string;
  phone?: string | null;
}

export class PaymentDto {
  id: string;
  amount: number;
  currency: string;
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  productType: ProductType;
  description: string | null;
  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  status: PaymentStatus;
  method: PaymentMethodRefDto;
  provider: string;
  /** Kaspi invoice / bank reference */
  reference: string | null;
  checkoutUrl: string | null;
  instructions: string | null;
  plan: PaymentPlanRefDto | null;
  trialId: string | null;
  membershipId: string | null;
  createdAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  failureReason: string | null;
  refundedAmount: number;
  refundedAt: Date | null;
  refundReason: string | null;
}

export class AdminPaymentDto extends PaymentDto {
  client: PersonRefDto;
  createdBy: PersonRefDto | null;
  confirmedBy: PersonRefDto | null;
  notes: string | null;
}

export class PurchaseMembershipDto {
  @IsUUID()
  planId: string;

  /** Payment method code, e.g. KASPI, CARD_ONLINE, CASH */
  @IsString()
  @MaxLength(40)
  methodCode: string;

  /** Must be true: acceptance of the current public offer is recorded */
  @IsBoolean()
  @Equals(true, { message: 'Please accept the public offer' })
  acceptOffer: boolean;
}

export class CreatePaymentRequestDto {
  @IsUUID()
  clientId: string;

  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  @IsEnum(ProductType)
  productType: ProductType;

  /** Required for MEMBERSHIP */
  @IsOptional()
  @IsUUID()
  planId?: string;

  /** For TRIAL payments */
  @IsOptional()
  @IsUUID()
  trialId?: string;

  /** KZT; defaults to the plan / trial price */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  amount?: number;

  @IsString()
  @MaxLength(40)
  methodCode: string;

  /** Kaspi invoice / reference number */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** Money already received — confirm immediately (activates the membership) */
  @IsOptional()
  @IsBoolean()
  markPaid?: boolean;
}

export class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  /** Change the method if the client paid differently */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  methodCode?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CancelPaymentDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class RefundPaymentDto {
  /** KZT; defaults to the full remaining amount */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsString()
  @Length(3, 500)
  reason: string;

  /** Also cancel the membership bought with this payment */
  @IsOptional()
  @IsBoolean()
  cancelMembership?: boolean;
}

export class PaymentListQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  methodCode?: string;

  @ApiPropertyOptional({ enum: ProductType, enumName: 'ProductType' })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class AdminPaymentPageDto {
  items: AdminPaymentDto[];
  total: number;
  page: number;
  pageSize: number;
  /** Sum of PAID amounts (minus refunds) matching the filter */
  totalPaid: number;
  /** Sum of PENDING amounts matching the filter (expected revenue) */
  totalPending: number;
}

export class CreatePaymentMethodDto {
  @Matches(/^[A-Z0-9_]{2,40}$/)
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsIn(['manual', 'mock_online', 'kaspi'])
  provider: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  availableToClients?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {}

export class MockCompleteDto {
  @IsIn(['success', 'fail'])
  result: 'success' | 'fail';
}
