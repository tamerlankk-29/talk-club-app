import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class GlobalSearchQueryDto {
  @IsString()
  @Length(2, 100)
  q: string;
}
