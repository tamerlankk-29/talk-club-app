import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { TimeOfDay, TrialOutcome, TrialStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TrialRequestDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsString()
  @MaxLength(32)
  phone: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceCode?: string;
}

export class TrialRequestResultDto {
  id: string;
  @ApiProperty({ enum: TrialStatus, enumName: 'TrialStatus' })
  status: TrialStatus;
  price: number;
}

export class TrialQueryDto {
  @ApiPropertyOptional({ enum: TrialStatus, enumName: 'TrialStatus' })
  @IsOptional()
  @IsEnum(TrialStatus)
  status?: TrialStatus;
}

export class ScheduleTrialDto {
  @IsUUID()
  sessionId: string;

  @IsOptional()
  @IsBoolean()
  overrideCapacity?: boolean;
}

export class TrialAttendanceDto {
  @IsBoolean()
  attended: boolean;
}

export class TrialOutcomeDto {
  @ApiProperty({ enum: TrialOutcome, enumName: 'TrialOutcome' })
  @IsEnum(TrialOutcome)
  outcome: TrialOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CancelTrialDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}
