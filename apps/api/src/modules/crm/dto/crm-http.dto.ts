import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsUUID } from 'class-validator';

export class MoveLeadDto {
  @ApiProperty({ enum: LeadStage, enumName: 'LeadStage' })
  @IsEnum(LeadStage)
  stage: LeadStage;
}

export class ClientTagsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  tagIds: string[];
}

export class CommunicationQueryDto {
  @IsUUID()
  clientId: string;
}
