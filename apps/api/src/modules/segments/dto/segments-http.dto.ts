import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SegmentDefinitionBody {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { match: 'all', rules: [{ field: 'daysSinceLastVisit', op: 'gte', value: 14 }] },
  })
  @IsObject()
  definition: Record<string, unknown>;
}

export class CreateSegmentDto extends SegmentDefinitionBody {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class UpdateSegmentDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}
