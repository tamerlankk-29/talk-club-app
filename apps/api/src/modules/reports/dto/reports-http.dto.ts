import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { Interval } from '../reports.service';

export class RangeQueryDto {
  /** yyyy-MM-dd (club time), defaults to 30 days ago */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** yyyy-MM-dd (club time), defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class RevenueQueryDto extends RangeQueryDto {
  @ApiPropertyOptional({ enum: ['day', 'week', 'month'] })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  interval?: Interval;
}
