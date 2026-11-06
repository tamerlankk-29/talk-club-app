import { ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional } from 'class-validator';

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class ImportQueryDto {
  /** Validate and count without writing anything */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  dryRun?: boolean;
}

export class ImportErrorDto {
  row: number;
  message: string;
}

export class ImportResultDto {
  jobId: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportErrorDto[];
}

export class ImportJobDto {
  id: string;
  source: string;
  fileName: string | null;
  status: string;
  dryRun: boolean;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } })
  errors: unknown;
  createdAt: Date;
  finishedAt: Date | null;
}
