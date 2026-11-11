import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { notFound } from '../../common/errors/domain-error';
import { builtInText } from '../../common/i18n/built-in-texts';
import { requestLocale } from '../../common/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from './catalog.service';
import {
  CreateGroupTypeDto,
  CreateLeadSourceDto,
  CreateLevelDto,
  CreateLocationDto,
  CreateProgramDto,
  CreateRoomDto,
  GroupTypeDto,
  LeadSourceDto,
  LevelDto,
  LocationDto,
  ProgramDto,
  RoomDto,
  UpdateGroupTypeDto,
  UpdateLeadSourceDto,
  UpdateLevelDto,
  UpdateLocationDto,
  UpdateProgramDto,
  UpdateRoomDto,
} from './dto/catalog.dto';
import { ProgramFilterDto, DeleteResultDto } from './dto/catalog-http.dto';

const locationDto = (l: Prisma.LocationGetPayload<object>): LocationDto => ({
  id: l.id,
  name: l.name,
  address: l.address,
  addressDetails: l.addressDetails,
  city: l.city,
  country: l.country,
  timezone: l.timezone,
  latitude: l.latitude,
  longitude: l.longitude,
  phone: l.phone,
  email: l.email,
  directions: l.directions,
  workingHours: (l.workingHours ?? {}) as LocationDto['workingHours'],
  isActive: l.isActive,
});

@ApiTags('Public · Club')
@Public()
@Controller('public')
export class PublicCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('programs')
  @ApiOperation({ summary: 'Programs visible in the client app' })
  programs(): Promise<ProgramDto[]> {
    return this.prisma.program.findMany({
      where: { isActive: true, isVisibleToClients: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('locations')
  @ApiOperation({ summary: 'Club locations with address, map coordinates and working hours' })
  async locations(): Promise<LocationDto[]> {
    const rows = await this.prisma.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const locale = requestLocale();
    return rows.map(locationDto).map((l) => ({
      ...l,
      name: builtInText(l.name, locale),
      address: builtInText(l.address, locale),
      addressDetails: builtInText(l.addressDetails, locale),
      city: builtInText(l.city, locale),
      directions: builtInText(l.directions, locale),
    }));
  }

  @Get('levels')
  @ApiOperation({ summary: 'English levels (active), ordered from easiest' })
  async levels(@Query() query: ProgramFilterDto): Promise<LevelDto[]> {
    const programId = query.programId ?? (await this.catalog.defaultProgram()).id;
    return this.prisma.level.findMany({ where: { programId, isActive: true }, orderBy: { rank: 'asc' } });
  }

  @Get('group-types')
  @ApiOperation({ summary: 'Group types (Speaking Club, Business Club, …)' })
  async groupTypes(@Query() query: ProgramFilterDto): Promise<GroupTypeDto[]> {
    const programId = query.programId ?? (await this.catalog.defaultProgram()).id;
    return this.prisma.groupType.findMany({ where: { programId, isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  @Get('lead-sources')
  @ApiOperation({ summary: '"How did you hear about us?" options' })
  async leadSources(): Promise<LeadSourceDto[]> {
    const rows = await this.prisma.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const locale = requestLocale();
    return rows.map((s) => ({ ...s, name: builtInText(s.name, locale) }));
  }
}

@ApiTags('Admin · Club structure')
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  // ─── Programs ───

  @Get('programs')
  @RequirePermissions('schedule.view')
  programs(): Promise<ProgramDto[]> {
    return this.prisma.program.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @Post('programs')
  @RequirePermissions('catalog.manage')
  async createProgram(@Body() dto: CreateProgramDto, @CurrentUser() user: AuthUser): Promise<ProgramDto> {
    const program = await this.prisma.program.create({ data: dto });
    await this.audit.log({ actor: user, action: 'program.create', entityType: 'Program', entityId: program.id, newValue: program });
    this.catalog.invalidate();
    return program;
  }

  @Patch('programs/:id')
  @RequirePermissions('catalog.manage')
  async updateProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProgramDto> {
    const before = await this.prisma.program.findUnique({ where: { id } });
    if (!before) throw notFound('Program');
    const program = await this.prisma.program.update({ where: { id }, data: dto });
    await this.audit.log({ actor: user, action: 'program.update', entityType: 'Program', entityId: id, oldValue: before, newValue: program });
    this.catalog.invalidate();
    return program;
  }

  // ─── Locations ───

  @Get('locations')
  @RequirePermissions('schedule.view')
  async locations(): Promise<LocationDto[]> {
    return (await this.prisma.location.findMany({ orderBy: { sortOrder: 'asc' } })).map(locationDto);
  }

  @Post('locations')
  @RequirePermissions('rooms.manage')
  async createLocation(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthUser): Promise<LocationDto> {
    const location = await this.prisma.location.create({
      data: { ...dto, workingHours: (dto.workingHours ?? {}) as Prisma.InputJsonValue },
    });
    await this.audit.log({ actor: user, action: 'location.create', entityType: 'Location', entityId: location.id, newValue: location });
    this.catalog.invalidate();
    return locationDto(location);
  }

  @Patch('locations/:id')
  @RequirePermissions('rooms.manage')
  @ApiOperation({ summary: 'Update a location, including working hours (no code changes needed)' })
  async updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<LocationDto> {
    const before = await this.prisma.location.findUnique({ where: { id } });
    if (!before) throw notFound('Location');
    const location = await this.prisma.location.update({
      where: { id },
      data: {
        ...dto,
        workingHours: dto.workingHours
          ? ({ ...(before.workingHours as object), ...dto.workingHours } as Prisma.InputJsonValue)
          : undefined,
      },
    });
    await this.audit.log({ actor: user, action: 'location.update', entityType: 'Location', entityId: id, oldValue: before, newValue: location });
    this.catalog.invalidate();
    return locationDto(location);
  }

  // ─── Rooms ───

  @Get('rooms')
  @RequirePermissions('schedule.view')
  rooms(): Promise<RoomDto[]> {
    return this.prisma.room.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  @Post('rooms')
  @RequirePermissions('rooms.manage')
  async createRoom(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthUser): Promise<RoomDto> {
    const room = await this.prisma.room.create({ data: dto });
    await this.audit.log({ actor: user, action: 'room.create', entityType: 'Room', entityId: room.id, newValue: room });
    return room;
  }

  @Patch('rooms/:id')
  @RequirePermissions('rooms.manage')
  async updateRoom(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto, @CurrentUser() user: AuthUser): Promise<RoomDto> {
    const before = await this.prisma.room.findUnique({ where: { id } });
    if (!before) throw notFound('Room');
    const room = await this.prisma.room.update({ where: { id }, data: dto });
    await this.audit.log({ actor: user, action: 'room.update', entityType: 'Room', entityId: id, oldValue: before, newValue: room });
    return room;
  }

  @Delete('rooms/:id')
  @RequirePermissions('rooms.manage')
  async deleteRoom(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<DeleteResultDto> {
    const inUse = (await this.prisma.session.count({ where: { roomId: id } })) + (await this.prisma.sessionTemplate.count({ where: { roomId: id } }));
    const result = await this.softDelete('room', id, inUse > 0, () => this.prisma.room.update({ where: { id }, data: { isActive: false } }), () => this.prisma.room.delete({ where: { id } }));
    await this.audit.log({ actor: user, action: 'room.delete', entityType: 'Room', entityId: id, newValue: result });
    return result;
  }

  // ─── Levels ───

  @Get('levels')
  @RequirePermissions('schedule.view')
  async levels(@Query() query: ProgramFilterDto): Promise<LevelDto[]> {
    const programId = query.programId ?? (await this.catalog.defaultProgram()).id;
    return this.prisma.level.findMany({ where: { programId }, orderBy: { rank: 'asc' } });
  }

  @Post('levels')
  @RequirePermissions('catalog.manage')
  async createLevel(@Body() dto: CreateLevelDto, @CurrentUser() user: AuthUser): Promise<LevelDto> {
    const programId = dto.programId ?? (await this.catalog.defaultProgram()).id;
    const level = await this.prisma.level.create({ data: { ...dto, programId } });
    await this.audit.log({ actor: user, action: 'level.create', entityType: 'Level', entityId: level.id, newValue: level });
    return level;
  }

  @Patch('levels/:id')
  @RequirePermissions('catalog.manage')
  async updateLevel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLevelDto, @CurrentUser() user: AuthUser): Promise<LevelDto> {
    const before = await this.prisma.level.findUnique({ where: { id } });
    if (!before) throw notFound('Level');
    const level = await this.prisma.level.update({ where: { id }, data: dto });
    await this.audit.log({ actor: user, action: 'level.update', entityType: 'Level', entityId: id, oldValue: before, newValue: level });
    return level;
  }

  @Delete('levels/:id')
  @RequirePermissions('catalog.manage')
  @ApiOperation({ summary: 'Delete a level (deactivated instead when clients or sessions use it)' })
  async deleteLevel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<DeleteResultDto> {
    const inUse =
      (await this.prisma.client.count({ where: { levelId: id } })) +
      (await this.prisma.session.count({ where: { OR: [{ levelMinId: id }, { levelMaxId: id }] } })) +
      (await this.prisma.clientLevel.count({ where: { levelId: id } }));
    const result = await this.softDelete('level', id, inUse > 0, () => this.prisma.level.update({ where: { id }, data: { isActive: false } }), () => this.prisma.level.delete({ where: { id } }));
    await this.audit.log({ actor: user, action: 'level.delete', entityType: 'Level', entityId: id, newValue: result });
    return result;
  }

  // ─── Group types ───

  @Get('group-types')
  @RequirePermissions('schedule.view')
  async groupTypes(@Query() query: ProgramFilterDto): Promise<GroupTypeDto[]> {
    const programId = query.programId ?? (await this.catalog.defaultProgram()).id;
    return this.prisma.groupType.findMany({ where: { programId }, orderBy: { sortOrder: 'asc' } });
  }

  @Post('group-types')
  @RequirePermissions('catalog.manage')
  async createGroupType(@Body() dto: CreateGroupTypeDto, @CurrentUser() user: AuthUser): Promise<GroupTypeDto> {
    const programId = dto.programId ?? (await this.catalog.defaultProgram()).id;
    const groupType = await this.prisma.groupType.create({ data: { ...dto, programId } });
    await this.audit.log({ actor: user, action: 'groupType.create', entityType: 'GroupType', entityId: groupType.id, newValue: groupType });
    return groupType;
  }

  @Patch('group-types/:id')
  @RequirePermissions('catalog.manage')
  async updateGroupType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupTypeDto, @CurrentUser() user: AuthUser): Promise<GroupTypeDto> {
    const before = await this.prisma.groupType.findUnique({ where: { id } });
    if (!before) throw notFound('Group type');
    const groupType = await this.prisma.groupType.update({ where: { id }, data: dto });
    await this.audit.log({ actor: user, action: 'groupType.update', entityType: 'GroupType', entityId: id, oldValue: before, newValue: groupType });
    return groupType;
  }

  // ─── Lead sources ───

  @Get('lead-sources')
  @RequirePermissions('crm.view')
  leadSources(): Promise<LeadSourceDto[]> {
    return this.prisma.leadSource.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @Post('lead-sources')
  @RequirePermissions('catalog.manage')
  async createLeadSource(@Body() dto: CreateLeadSourceDto, @CurrentUser() user: AuthUser): Promise<LeadSourceDto> {
    const source = await this.prisma.leadSource.create({ data: dto });
    await this.audit.log({ actor: user, action: 'leadSource.create', entityType: 'LeadSource', entityId: source.id, newValue: source });
    return source;
  }

  @Patch('lead-sources/:id')
  @RequirePermissions('catalog.manage')
  async updateLeadSource(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadSourceDto, @CurrentUser() user: AuthUser): Promise<LeadSourceDto> {
    const before = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!before) throw notFound('Lead source');
    const source = await this.prisma.leadSource.update({ where: { id }, data: dto });
    await this.audit.log({ actor: user, action: 'leadSource.update', entityType: 'LeadSource', entityId: id, oldValue: before, newValue: source });
    return source;
  }

  private async softDelete(
    _kind: string,
    _id: string,
    inUse: boolean,
    deactivate: () => Promise<unknown>,
    remove: () => Promise<unknown>,
  ): Promise<DeleteResultDto> {
    if (inUse) {
      await deactivate();
      return { deleted: false, deactivated: true };
    }
    await remove();
    return { deleted: true, deactivated: false };
  }
}
