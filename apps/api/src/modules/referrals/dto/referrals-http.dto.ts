import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ReferralStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class ReferralQueryDto {
  @ApiPropertyOptional({ enum: ReferralStatus, enumName: 'ReferralStatus' })
  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;
}

export class RewardReferralDto {
  /** What was given, e.g. "+1 free visit added to STANDARD" */
  @IsString()
  @Length(1, 300)
  note: string;
}

export class ReferralPersonDto {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

export class ReferralCodeRefDto {
  code: string;
}

export class ReferralAdminDto {
  id: string;
  @ApiPropertyOptional({ enum: ReferralStatus, enumName: 'ReferralStatus' })
  status: ReferralStatus;
  rewardNote: string | null;
  rewardedAt: Date | null;
  createdAt: Date;
  code: ReferralCodeRefDto;
  referrer: ReferralPersonDto;
  referred: ReferralPersonDto;
}

export class ReferralRewardResultDto {
  id: string;
  @ApiPropertyOptional({ enum: ReferralStatus, enumName: 'ReferralStatus' })
  status: ReferralStatus;
  rewardNote: string | null;
  rewardedAt: Date | null;
}
