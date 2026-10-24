import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PaginationQueryDto {
  /** Page number, starting at 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Items per page (max 100) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;
}

export class SearchQueryDto extends PaginationQueryDto {
  /** Free-text search */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class PageMetaDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageArgs(query: PaginationQueryDto): { skip: number; take: number } {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta(query: PaginationQueryDto, total: number): PageMetaDto {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export class OkResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;
}
