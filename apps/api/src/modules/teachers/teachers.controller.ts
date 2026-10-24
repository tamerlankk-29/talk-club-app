import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import {
  CreateTeacherDto,
  TeacherAccountDto,
  TeacherAccountResultDto,
  TeacherAdminDto,
  TeacherPublicDto,
  UpdateTeacherDto,
} from './dto/teacher.dto';
import { TeachersService } from './teachers.service';

@ApiTags('Public · Teachers')
@Public()
@Controller('public/teachers')
export class PublicTeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ApiOperation({ summary: 'Active teachers' })
  list(): Promise<TeacherPublicDto[]> {
    return this.teachers.listPublic();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Teacher profile' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TeacherPublicDto> {
    return this.teachers.getPublic(id);
  }
}

@ApiTags('Admin · Teachers')
@Controller('admin/teachers')
export class AdminTeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @RequirePermissions('schedule.view')
  @ApiOperation({ summary: 'All teachers (session rates only with teachers.view_rates)' })
  list(@CurrentUser() user: AuthUser): Promise<TeacherAdminDto[]> {
    return this.teachers.listAdmin(user);
  }

  @Get(':id')
  @RequirePermissions('schedule.view')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<TeacherAdminDto> {
    return this.teachers.getAdmin(id, user);
  }

  @Post()
  @RequirePermissions('teachers.manage')
  create(@Body() dto: CreateTeacherDto, @CurrentUser() user: AuthUser): Promise<TeacherAdminDto> {
    return this.teachers.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('teachers.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TeacherAdminDto> {
    return this.teachers.update(id, dto, user);
  }

  @Post(':id/account')
  @RequirePermissions('teachers.manage', 'staff.manage')
  @ApiOperation({ summary: 'Create or reset the teacher panel login (TEACHER role)' })
  account(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TeacherAccountDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TeacherAccountResultDto> {
    return this.teachers.createAccount(id, dto, user);
  }
}
