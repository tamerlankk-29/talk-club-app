import { Body, Controller, Get, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { LegalDocumentType } from '@prisma/client';
import { IsEnum, IsString, Length, MaxLength } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { notFound } from '../../common/errors/domain-error';
import { LegalService } from './legal.service';
import { LegalDocumentDto, PublishLegalDocumentDto } from './dto/legal-http.dto';

const toDto = (d: LegalDocumentDto): LegalDocumentDto => ({
  id: d.id,
  type: d.type,
  version: d.version,
  title: d.title,
  content: d.content,
  isCurrent: d.isCurrent,
  publishedAt: d.publishedAt,
});

@ApiTags('Legal')
@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get('public/legal')
  @ApiOperation({ summary: 'Current versions of the terms, privacy policy and public offer' })
  async current(): Promise<LegalDocumentDto[]> {
    return (await this.legal.currentAll()).map(toDto);
  }

  @Public()
  @Get('public/legal/:type')
  @ApiOperation({ summary: 'Current version of one legal document' })
  async one(@Param('type', new ParseEnumPipe(LegalDocumentType)) type: LegalDocumentType): Promise<LegalDocumentDto> {
    const doc = await this.legal.current(type);
    if (!doc) throw notFound('Document');
    return toDto(doc);
  }

  @Get('admin/legal/:type/versions')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'All versions of a legal document' })
  async versions(@Param('type', new ParseEnumPipe(LegalDocumentType)) type: LegalDocumentType): Promise<LegalDocumentDto[]> {
    return (await this.legal.versions(type)).map(toDto);
  }

  @Post('admin/legal')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Publish a new version (previous acceptances keep referencing their version)' })
  async publish(@Body() dto: PublishLegalDocumentDto, @CurrentUser() user: AuthUser): Promise<LegalDocumentDto> {
    return toDto(await this.legal.publish(dto, user));
  }
}
