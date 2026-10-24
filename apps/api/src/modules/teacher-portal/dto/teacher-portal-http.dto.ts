import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class TeacherSessionsQueryDto {
  @ApiPropertyOptional({ enum: ['today', 'upcoming', 'past', 'week'] })
  @IsOptional()
  @IsIn(['today', 'upcoming', 'past', 'week'])
  scope?: 'today' | 'upcoming' | 'past' | 'week';

  /** Club-local date for today/week views, yyyy-MM-dd */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
