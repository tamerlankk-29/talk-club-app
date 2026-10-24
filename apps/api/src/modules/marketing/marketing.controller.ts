import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, OptionalAuth, RequirePermissions, ViewerClientId } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { AnnouncementsService } from './announcements.service';
import { BroadcastsService } from './broadcasts.service';
import {
  AnnouncementDto,
  AudiencePreviewDto,
  BroadcastDto,
  CreateAnnouncementDto,
  CreateBroadcastDto,
  ScheduleBroadcastDto,
  UpdateAnnouncementDto,
  UpdateBroadcastDto,
} from './dto/marketing.dto';
import { AudiencePreviewResultDto } from './dto/marketing.dto';

@ApiTags('Announcements')
@Controller()
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @OptionalAuth()
  @Get('announcements')
  @ApiOperation({ summary: 'Announcements for the client home screen (audience-filtered when signed in)' })
  forMe(@ViewerClientId() viewerClientId: string | null): Promise<AnnouncementDto[]> {
    return this.announcements.forClient(viewerClientId);
  }

  @Get('admin/announcements')
  @RequirePermissions('announcements.manage')
  list(): Promise<AnnouncementDto[]> {
    return this.announcements.list();
  }

  @Post('admin/announcements')
  @RequirePermissions('announcements.manage')
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser): Promise<AnnouncementDto> {
    return this.announcements.create(dto, user);
  }

  @Patch('admin/announcements/:id')
  @RequirePermissions('announcements.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto, @CurrentUser() user: AuthUser): Promise<AnnouncementDto> {
    return this.announcements.update(id, dto, user);
  }

  @Delete('admin/announcements/:id')
  @RequirePermissions('announcements.manage')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.announcements.remove(id, user);
    return { ok: true };
  }
}

@ApiTags('Admin · Broadcasts')
@Controller('admin/broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  @RequirePermissions('broadcasts.manage')
  list(): Promise<BroadcastDto[]> {
    return this.broadcasts.list();
  }

  @Post('audience-preview')
  @HttpCode(200)
  @RequirePermissions('broadcasts.manage')
  @ApiOperation({ summary: 'How many clients a broadcast would reach (with marketing consent applied)' })
  preview(@Body() dto: AudiencePreviewDto): Promise<AudiencePreviewResultDto> {
    return this.broadcasts.previewAudience(dto);
  }

  @Get(':id')
  @RequirePermissions('broadcasts.manage')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BroadcastDto> {
    return this.broadcasts.get(id);
  }

  @Post()
  @RequirePermissions('broadcasts.manage')
  @ApiOperation({ summary: 'Create a broadcast (draft, or scheduled when scheduledAt is set)' })
  create(@Body() dto: CreateBroadcastDto, @CurrentUser() user: AuthUser): Promise<BroadcastDto> {
    return this.broadcasts.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('broadcasts.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBroadcastDto, @CurrentUser() user: AuthUser): Promise<BroadcastDto> {
    return this.broadcasts.update(id, dto, user);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  @RequirePermissions('broadcasts.manage')
  schedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleBroadcastDto, @CurrentUser() user: AuthUser): Promise<BroadcastDto> {
    return this.broadcasts.schedule(id, dto.scheduledAt, user);
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermissions('broadcasts.manage')
  @ApiOperation({ summary: 'Send immediately' })
  send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<BroadcastDto> {
    return this.broadcasts.sendNow(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('broadcasts.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<BroadcastDto> {
    return this.broadcasts.cancel(id, user);
  }
}
