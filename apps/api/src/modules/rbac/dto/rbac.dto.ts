import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PermissionDto {
  key: string;
  group: string;
  description: string;
}

export class RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export class CreateRoleDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { message: 'key: UPPER_CASE, e.g. RECEPTION' })
  key: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}

/** Minimal staff info for assignee pickers (no contact details). */
export class TeamMemberDto {
  id: string;
  displayName: string;
  roles: string[];
  isTeacher: boolean;
}

export class StaffUserDto {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  teacherId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export class CreateStaffDto {
  @IsString()
  @Length(1, 80)
  displayName: string;

  @IsEmail()
  @MaxLength(120)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  /** Leave empty to generate a temporary password (returned once) */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roles: string[];
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED'])
  status?: 'ACTIVE' | 'BLOCKED';
}

export class StaffCreatedDto extends StaffUserDto {
  temporaryPassword?: string;
}

export class ResetStaffPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

export class StaffQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeBlocked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ResetPasswordResultDto {
  /** Only when the password was generated */
  temporaryPassword?: string;
}
