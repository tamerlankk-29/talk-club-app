import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LevelDto } from '../../catalog/dto/catalog.dto';

export class AvailabilitySlotDto {
  /** ISO weekday 1 (Mon) … 7 (Sun) */
  @IsInt()
  @Min(1)
  @Max(7)
  day: number;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  from: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  to: string;
}

export class TeacherPublicDto {
  id: string;
  name: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  country: string | null;
  nativeLanguage: string | null;
  headline: string | null;
  bio: string | null;
  specialization: string | null;
  levelFrom: LevelDto | null;
  levelTo: LevelDto | null;
  /** e.g. "Elementary – Intermediate" */
  levelsLabel: string;
}

export class TeacherAdminDto extends TeacherPublicDto {
  userId: string | null;
  loginEmail: string | null;
  englishLevel: string | null;
  availability: AvailabilitySlotDto[];
  /** Null when the viewer lacks teachers.view_rates */
  sessionRate: number | null;
  isActive: boolean;
  sortOrder: number;
  upcomingSessions: number;
}

export class CreateTeacherDto {
  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nativeLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  englishLevel?: string;

  /** Short line under the name, e.g. "Native English Speaker" */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  specialization?: string;

  @IsOptional()
  @IsUUID()
  levelFromId?: string | null;

  @IsOptional()
  @IsUUID()
  levelToId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  availability?: AvailabilitySlotDto[];

  /** Teacher pay per session, KZT */
  @IsOptional()
  @IsInt()
  @Min(0)
  sessionRate?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {}

export class TeacherAccountDto {
  @IsEmail()
  @MaxLength(120)
  email: string;

  /** Leave empty to generate a temporary password (returned once) */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

export class TeacherAccountResultDto {
  userId: string;
  email: string;
  /** Only present when the password was generated */
  temporaryPassword?: string;
}
