import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ClientCategory, FormatPreference, TimeOfDay } from '@prisma/client';
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

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string | null;

  @IsOptional()
  @IsUUID()
  levelId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  preferredDays?: number[];

  @ApiPropertyOptional({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TimeOfDay, { each: true })
  preferredTimes?: TimeOfDay[];

  @ApiPropertyOptional({ enum: FormatPreference, enumName: 'FormatPreference' })
  @IsOptional()
  @IsEnum(FormatPreference)
  formatPreference?: FormatPreference;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  preferredTeacherIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string | null;
}

export class ChildDto {
  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  @ApiPropertyOptional({ enum: ['CHILD', 'TEEN'] })
  @IsOptional()
  @IsIn(['CHILD', 'TEEN'])
  category?: ClientCategory;
}

export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;
}

export class DeletionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
