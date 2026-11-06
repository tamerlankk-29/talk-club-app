import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TimelineQueryDto {
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AnonymizeDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class DataRequestQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'COMPLETED', 'REJECTED'])
  status?: 'PENDING' | 'COMPLETED' | 'REJECTED';
}

export class RejectDataRequestDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}
