import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ClientCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// ─── Programs ───

export class ProgramDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  isVisibleToClients: boolean;
  sortOrder: number;
}

export class CreateProgramDto {
  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/, { message: 'slug: lowercase letters, digits and dashes' })
  slug: string;

  @IsString()
  @Length(1, 80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Show this program in the client app (e.g. keep Math Club hidden until launch) */
  @IsOptional()
  @IsBoolean()
  isVisibleToClients?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}

// ─── Locations & working hours ───

export class DayHoursDto {
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  open: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  close: string;
}

/** ISO weekday keys "1" (Mon) … "7" (Sun); null = closed */
export class WorkingHoursDto {
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '1'?: DayHoursDto | null;
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '2'?: DayHoursDto | null;
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '3'?: DayHoursDto | null;
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '4'?: DayHoursDto | null;
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '5'?: DayHoursDto | null;
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '6'?: DayHoursDto | null;
  @IsOptional() @ValidateNested() @Type(() => DayHoursDto) '7'?: DayHoursDto | null;
}

export class LocationDto {
  id: string;
  name: string;
  address: string;
  addressDetails: string | null;
  city: string;
  country: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  directions: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'object', nullable: true, properties: { open: { type: 'string' }, close: { type: 'string' } } },
    example: { '1': { open: '12:30', close: '20:00' }, '7': null },
  })
  workingHours: Record<string, { open: string; close: string } | null>;
  isActive: boolean;
}

export class CreateLocationDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsString()
  @Length(1, 200)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  /** IANA timezone, e.g. Asia/Almaty */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  /** How to find the offices */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  directions?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}

// ─── Rooms ───

export class RoomDto {
  id: string;
  locationId: string;
  name: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export class CreateRoomDto {
  @IsUUID()
  locationId: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsInt()
  @Min(1)
  @Max(200)
  capacity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {}

// ─── Levels ───

export class LevelDto {
  id: string;
  programId: string;
  name: string;
  code: string | null;
  rank: number;
  description: string | null;
  color: string | null;
  isActive: boolean;
}

export class CreateLevelDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  /** Ordering (lower = easier). Use gaps, e.g. 10, 20, 30. */
  @IsInt()
  @Min(0)
  @Max(10_000)
  rank: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLevelDto extends PartialType(CreateLevelDto) {}

// ─── Group types ───

export class GroupTypeDto {
  id: string;
  programId: string;
  name: string;
  description: string | null;
  color: string | null;
  @ApiProperty({ enum: ClientCategory, enumName: 'ClientCategory', isArray: true })
  clientCategories: ClientCategory[];
  isActive: boolean;
  sortOrder: number;
}

export class CreateGroupTypeDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  /** Who can book; empty = everyone */
  @ApiPropertyOptional({ enum: ClientCategory, enumName: 'ClientCategory', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ClientCategory, { each: true })
  clientCategories?: ClientCategory[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateGroupTypeDto extends PartialType(CreateGroupTypeDto) {}

// ─── Lead sources ───

export class LeadSourceDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export class CreateLeadSourceDto {
  @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'code: UPPER_CASE letters, digits, underscore' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateLeadSourceDto extends PartialType(CreateLeadSourceDto) {}
