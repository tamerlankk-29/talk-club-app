import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ClientCategory, FormatPreference, TimeOfDay } from '@prisma/client';
import type { Response } from 'express';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { ActingClient, ActingClientRef, ClientArea, CurrentUser } from '../../common/auth/decorators';
import { ClientStatsDto, ClientStatsService } from '../clients/client-stats.service';
import { MeService } from './me.service';
import { UpdateProfileDto, ChildDto, UpdateChildDto, DeletionRequestDto, SetLocaleDto } from './dto/me-http.dto';
import { SessionUserDto } from '../auth/dto/auth.dto';
import { ClientProfileDto } from '../clients/dto/client.dto';
import { AgreementDto, DeletionRequestResultDto, FamilyMemberDto, HomeDto, MeDto, ReferralInfoDto } from './dto/me-responses.dto';

@ApiTags('Me (client self-service)')
@ApiBearerAuth()
@Controller()
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly stats: ClientStatsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Signed-in user, roles/areas and client profile' })
  getMe(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.me.me(user);
  }

  @Patch('me/locale')
  @ApiOperation({ summary: 'Set the interface and message language (en, ru, kk)' })
  setLocale(@Body() dto: SetLocaleDto, @CurrentUser() user: AuthUser): Promise<SessionUserDto> {
    return this.me.setLocale(user, dto.locale);
  }

  @ClientArea()
  @Get('my/home')
  @ApiOperation({ summary: 'Home screen: membership, next session, recommendations, today/tomorrow, announcements' })
  home(@ActingClient() acting: ActingClientRef, @CurrentUser() user: AuthUser): Promise<HomeDto> {
    return this.me.home(acting.clientId, user);
  }

  @ClientArea()
  @Get('my/profile')
  profile(@ActingClient() acting: ActingClientRef): Promise<ClientProfileDto> {
    return this.me.profile(acting.clientId);
  }

  @ClientArea()
  @Patch('my/profile')
  @ApiOperation({ summary: 'Update personal information and preferences' })
  updateProfile(@ActingClient() acting: ActingClientRef, @Body() dto: UpdateProfileDto, @CurrentUser() user: AuthUser): Promise<ClientProfileDto> {
    return this.me.updateProfile(acting.clientId, dto, user);
  }

  @ClientArea()
  @Get('my/stats')
  @ApiOperation({ summary: 'Sessions attended, attendance rate, streak, hours speaking, monthly chart' })
  myStats(@ActingClient() acting: ActingClientRef): Promise<ClientStatsDto> {
    return this.stats.stats(acting.clientId);
  }

  @ClientArea()
  @Get('my/referral')
  @ApiOperation({ summary: 'Personal referral code and invited friends' })
  referral(@ActingClient() acting: ActingClientRef): Promise<ReferralInfoDto> {
    return this.me.referral(acting.clientId);
  }

  @Get('my/family')
  @ApiOperation({ summary: 'Child profiles managed by this account' })
  family(@CurrentUser() user: AuthUser): Promise<FamilyMemberDto[]> {
    return this.me.family(user);
  }

  @Post('my/family')
  @ApiOperation({ summary: 'Add a child profile (the parent books and pays for it)' })
  addChild(@Body() dto: ChildDto, @CurrentUser() user: AuthUser): Promise<FamilyMemberDto[]> {
    return this.me.addChild(dto, user);
  }

  @Patch('my/family/:id')
  updateChild(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChildDto, @CurrentUser() user: AuthUser): Promise<FamilyMemberDto[]> {
    return this.me.updateChild(id, dto, user);
  }

  @ClientArea()
  @Get('my/agreements')
  @ApiOperation({ summary: 'Accepted terms, privacy policy and public offer versions' })
  agreements(@ActingClient() acting: ActingClientRef): Promise<AgreementDto[]> {
    return this.me.agreements(acting.clientId);
  }

  @ClientArea()
  @Get('my/data-export')
  @ApiOperation({ summary: 'Download a copy of your personal data (JSON)' })
  async export(@ActingClient() acting: ActingClientRef, @CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const data = await this.me.exportData(acting.clientId, user);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="talk-club-my-data.json"');
    res.send(JSON.stringify(data, null, 2));
  }

  @ClientArea()
  @Post('my/deletion-request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ask Talk Club to delete your account and personal data' })
  deletion(@ActingClient() acting: ActingClientRef, @Body() dto: DeletionRequestDto, @CurrentUser() user: AuthUser): Promise<DeletionRequestResultDto> {
    return this.me.requestDeletion(acting.clientId, dto.reason, user);
  }
}
