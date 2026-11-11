import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GiftCertificateStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PageMetaDto, SearchQueryDto } from '../../../common/dto/pagination.dto';

export class GiftClientRefDto {
  id: string;
  name: string;
  phone: string | null;
}

export class GiftCertificateDto {
  id: string;
  code: string;
  planId: string;
  planName: string;
  visits: number;
  validityDays: number;
  price: number;
  recipientName: string | null;
  message: string | null;
  /** ACTIVE certificates past their last redemption day are reported as EXPIRED */
  @ApiProperty({ enum: ['ACTIVE', 'REDEEMED', 'CANCELLED', 'EXPIRED'] })
  status: 'ACTIVE' | 'REDEEMED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: Date;
  buyer: GiftClientRefDto;
  paymentId: string;
  redeemedBy: GiftClientRefDto | null;
  redeemedAt: Date | null;
  membershipId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
}

export class GiftCertificatePageDto {
  items: GiftCertificateDto[];
  meta: PageMetaDto;
}

export class GiftCertificateQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'REDEEMED', 'CANCELLED', 'EXPIRED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'REDEEMED', 'CANCELLED', 'EXPIRED'])
  status?: GiftCertificateStatus | 'EXPIRED';
}

export class SellGiftCertificateDto {
  /** Membership plan the certificate gives */
  @IsUUID()
  planId: string;

  /** The client who pays for the certificate */
  @IsUUID()
  buyerClientId: string;

  /** How it was paid at the desk (CASH, CARD, …) */
  @IsString()
  @MaxLength(40)
  methodCode: string;

  /** Defaults to the plan price */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipientName?: string;

  /** Printed on the certificate */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;

  /** Days the code can be redeemed (default 180) */
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(730)
  redeemWithinDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class RedeemGiftCertificateDto {
  /** TC-XXXX-XXXX; spaces, dashes and case are ignored */
  @IsString()
  @MaxLength(40)
  code: string;
}

export class AdminRedeemGiftCertificateDto {
  @IsUUID()
  clientId: string;
}

export class CancelGiftCertificateDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

export class GiftRedeemedDto {
  membershipId: string;
  planName: string;
  visits: number;
  expiresAt: Date;
}
