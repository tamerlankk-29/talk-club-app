import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { ClientStatsDto, ClientStatsService } from './client-stats.service';
import { ClientsService } from './clients.service';
import {
  ActivityDto,
  AddNoteDto,
  ClientDetailDto,
  ClientListPageDto,
  ClientListQueryDto,
  CreateClientDto,
  DataRequestDto,
  LinkGuardianDto,
  UpdateClientDto,
} from './dto/client.dto';
import { AnonymizeDto, DataRequestQueryDto, RejectDataRequestDto, TimelineQueryDto } from './dto/clients-http.dto';

@ApiTags('Admin · Clients')
@Controller('admin')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly stats: ClientStatsService,
  ) {}

  @Get('clients')
  @RequirePermissions('clients.view')
  @ApiOperation({ summary: 'Clients with search (name, phone, email) and filters (membership, level, tag, segment)' })
  list(@Query() query: ClientListQueryDto): Promise<ClientListPageDto> {
    return this.clients.list(query);
  }

  @Get('clients/:id')
  @RequirePermissions('clients.view')
  @ApiOperation({ summary: 'Everything about a client in one place (memberships, bookings, payments, CRM…)' })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<ClientDetailDto> {
    return this.clients.detail(id);
  }

  @Get('clients/:id/stats')
  @RequirePermissions('clients.view')
  clientStats(@Param('id', ParseUUIDPipe) id: string): Promise<ClientStatsDto> {
    return this.stats.stats(id);
  }

  @Get('clients/:id/timeline')
  @RequirePermissions('clients.view')
  @ApiOperation({ summary: 'Activity timeline (purchases, visits, cancellations, notes, CRM changes)' })
  timeline(@Param('id', ParseUUIDPipe) id: string, @Query() query: TimelineQueryDto): Promise<ActivityDto[]> {
    return this.clients.timeline(id, query.before, query.limit);
  }

  @Post('clients')
  @RequirePermissions('clients.manage')
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser): Promise<ClientDetailDto> {
    return this.clients.create(dto, user);
  }

  @Patch('clients/:id')
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: 'Edit a client (level changes are kept in the level history)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: AuthUser): Promise<ClientDetailDto> {
    return this.clients.update(id, dto, user);
  }

  @Post('clients/:id/notes')
  @RequirePermissions('clients.manage')
  note(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddNoteDto, @CurrentUser() user: AuthUser): Promise<ActivityDto[]> {
    return this.clients.addNote(id, dto.text, user);
  }

  @Post('clients/:id/archive')
  @HttpCode(200)
  @RequirePermissions('clients.manage')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<ClientDetailDto> {
    return this.clients.setArchived(id, true, user);
  }

  @Post('clients/:id/unarchive')
  @HttpCode(200)
  @RequirePermissions('clients.manage')
  unarchive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<ClientDetailDto> {
    return this.clients.setArchived(id, false, user);
  }

  @Post('clients/:id/guardians')
  @RequirePermissions('clients.manage')
  @ApiOperation({ summary: "Link a parent's account to a child profile" })
  guardian(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkGuardianDto, @CurrentUser() user: AuthUser): Promise<ClientDetailDto> {
    return this.clients.linkGuardian(id, dto.guardianPhone, dto.relationship, user);
  }

  @Post('clients/:id/anonymize')
  @HttpCode(200)
  @RequirePermissions('clients.delete')
  @ApiOperation({ summary: 'Process a deletion request: erase personal data, keep anonymous accounting records' })
  async anonymize(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnonymizeDto, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.clients.anonymize(id, dto.reason, user);
    return { ok: true };
  }

  @Get('data-requests')
  @RequirePermissions('clients.delete')
  @ApiOperation({ summary: 'Client data export / deletion requests' })
  dataRequests(@Query() query: DataRequestQueryDto): Promise<DataRequestDto[]> {
    return this.clients.dataRequests(query.status);
  }

  @Post('data-requests/:id/reject')
  @HttpCode(200)
  @RequirePermissions('clients.delete')
  @ApiOperation({ summary: 'Decline a pending data request (reason is audited)' })
  async rejectDataRequest(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDataRequestDto, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.clients.rejectDataRequest(id, dto.reason, user);
    return { ok: true };
  }
}
