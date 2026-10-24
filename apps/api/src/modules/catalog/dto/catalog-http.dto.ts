import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';

export class ProgramFilterDto {
  @IsOptional()
  @IsUUID()
  programId?: string;
}

export class DeleteResultDto {
  deleted: boolean;
  /** True when the record is still referenced and was deactivated instead */
  deactivated: boolean;
}
