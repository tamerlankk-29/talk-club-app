import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { SEGMENT_FIELDS } from './segment-rules';
import { SegmentsService } from './segments.service';
import { SegmentDefinitionBody, CreateSegmentDto, UpdateSegmentDto } from './dto/segments-http.dto';
import { SegmentDto, SegmentFieldDto, SegmentPreviewDto } from './dto/segments-responses.dto';

@ApiTags('Admin · Segments')
@Controller('admin/segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get('fields')
  @RequirePermissions('crm.view')
  @ApiOperation({ summary: 'Available rule fields for the segment builder' })
  fields(): SegmentFieldDto[] {
    return SEGMENT_FIELDS;
  }

  @Get()
  @RequirePermissions('crm.view')
  @ApiOperation({ summary: 'Built-in and custom segments with live client counts' })
  list(): Promise<SegmentDto[]> {
    return this.segments.list();
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('crm.view')
  @ApiOperation({ summary: 'Count and sample clients matching a definition' })
  preview(@Body() dto: SegmentDefinitionBody): Promise<SegmentPreviewDto> {
    return this.segments.preview(this.segments.parse(dto.definition));
  }

  @Get(':id/preview')
  @RequirePermissions('crm.view')
  async previewSaved(@Param('id', ParseUUIDPipe) id: string): Promise<SegmentPreviewDto> {
    return this.segments.preview(await this.segments.definitionOf(id));
  }

  @Post()
  @RequirePermissions('segments.manage')
  create(@Body() dto: CreateSegmentDto, @CurrentUser() user: AuthUser): Promise<SegmentDto> {
    return this.segments.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('segments.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSegmentDto, @CurrentUser() user: AuthUser): Promise<SegmentDto> {
    return this.segments.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('segments.manage')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    await this.segments.remove(id, user);
    return { ok: true };
  }
}
