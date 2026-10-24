import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ReferralStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ReferralsService } from './referrals.service';
import { ReferralQueryDto, RewardReferralDto } from './dto/referrals-http.dto';
import { ReferralAdminDto, ReferralRewardResultDto } from './dto/referrals-http.dto';

@ApiTags('Admin · Referrals')
@Controller('admin/referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @RequirePermissions('crm.view')
  @ApiOperation({ summary: 'Referrals with referrer and referred client' })
  list(@Query() query: ReferralQueryDto): Promise<ReferralAdminDto[]> {
    return this.referrals.list(query.status) as unknown as Promise<ReferralAdminDto[]>;
  }

  @Post(':id/reward')
  @RequirePermissions('crm.manage')
  @ApiOperation({ summary: 'Record that a referral reward was given' })
  reward(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RewardReferralDto, @CurrentUser() user: AuthUser): Promise<ReferralRewardResultDto> {
    return this.referrals.markRewarded(id, dto.note, user);
  }
}
