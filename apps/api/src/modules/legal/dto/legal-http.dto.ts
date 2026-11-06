import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { LegalDocumentType } from '@prisma/client';
import { IsEnum, IsString, Length, MaxLength } from 'class-validator';

export class LegalDocumentDto {
  id: string;
  @ApiProperty({ enum: LegalDocumentType, enumName: 'LegalDocumentType' })
  type: LegalDocumentType;
  version: number;
  title: string;
  content: string;
  isCurrent: boolean;
  publishedAt: Date;
}

export class PublishLegalDocumentDto {
  @ApiProperty({ enum: LegalDocumentType, enumName: 'LegalDocumentType' })
  @IsEnum(LegalDocumentType)
  type: LegalDocumentType;

  @IsString()
  @Length(1, 200)
  title: string;

  /** Markdown */
  @IsString()
  @MaxLength(100_000)
  content: string;
}
