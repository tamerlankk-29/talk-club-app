import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import {
  CreateRoleDto,
  CreateStaffDto,
  PermissionDto,
  ResetStaffPasswordDto,
  RoleDto,
  StaffCreatedDto,
  StaffUserDto,
  TeamMemberDto,
  UpdateRoleDto,
  UpdateStaffDto,
} from './dto/rbac.dto';
import { RbacService } from './rbac.service';
import { ResetPasswordResultDto } from './dto/rbac.dto';

@ApiTags('Admin · Roles & staff')
@Controller('admin')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Permission catalog' })
  permissions(): Promise<PermissionDto[]> {
    return this.rbac.permissions();
  }

  @Get('roles')
  @RequirePermissions('staff.manage')
  roles(): Promise<RoleDto[]> {
    return this.rbac.roles();
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthUser): Promise<RoleDto[]> {
    return this.rbac.createRole(dto, user);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Change a role name or its permissions (applies within seconds)' })
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser): Promise<RoleDto[]> {
    return this.rbac.updateRole(id, dto, user);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  deleteRole(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<RoleDto[]> {
    return this.rbac.deleteRole(id, user);
  }

  @Get('team')
  @RequirePermissions('crm.view')
  @ApiOperation({ summary: 'Active staff members (names and roles) for task assignment and filters' })
  team(): Promise<TeamMemberDto[]> {
    return this.rbac.team();
  }

  @Get('staff')
  @RequirePermissions('staff.manage')
  staff(): Promise<StaffUserDto[]> {
    return this.rbac.staff();
  }

  @Post('staff')
  @RequirePermissions('staff.manage')
  @ApiOperation({ summary: 'Create a staff account (admin, manager, marketing, teacher…)' })
  createStaff(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthUser): Promise<StaffCreatedDto> {
    return this.rbac.createStaff(dto, user);
  }

  @Patch('staff/:id')
  @RequirePermissions('staff.manage')
  updateStaff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto, @CurrentUser() user: AuthUser): Promise<StaffUserDto> {
    return this.rbac.updateStaff(id, dto, user);
  }

  @Post('staff/:id/reset-password')
  @HttpCode(200)
  @RequirePermissions('staff.manage')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetStaffPasswordDto, @CurrentUser() user: AuthUser): Promise<ResetPasswordResultDto> {
    return this.rbac.resetPassword(id, dto.password, user);
  }
}
