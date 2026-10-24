import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class FeedbackBodyDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) participation?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(5) fluency?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(5) vocabulary?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(5) confidence?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(5) pronunciation?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(5) conversation?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;

  @IsOptional()
  @IsBoolean()
  isVisibleToClient?: boolean;
}

export class FeedbackQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;
}
