import { Controller, Get, HttpCode, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { DomainError } from '../../common/errors/domain-error';
import { DataTransferService, EXPORT_DATASETS, ExportDataset, ImportKind, ImportResult } from './data-transfer.service';
import { ExportQueryDto, ImportQueryDto } from './dto/data-transfer-http.dto';
import { ImportJobDto, ImportResultDto } from './dto/data-transfer-http.dto';

const IMPORT_KINDS: ImportKind[] = ['clients', 'altegio-clients', 'altegio-visits', 'altegio-payments'];

@ApiTags('Admin · Import & export')
@Controller('admin')
export class DataTransferController {
  constructor(private readonly transfer: DataTransferService) {}

  @Get('exports/:dataset')
  @RequirePermissions('data.export')
  @ApiOperation({ summary: `Download ${EXPORT_DATASETS.join(', ')} as CSV or XLSX` })
  async export(@Param('dataset') dataset: string, @Query() query: ExportQueryDto, @CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    if (!EXPORT_DATASETS.includes(dataset as ExportDataset)) throw new DomainError('NOT_FOUND', { message: 'Unknown dataset.' });
    if ((dataset === 'payments' || dataset === 'revenue') && !user.permissions.has('finance.view')) throw new DomainError('FORBIDDEN');
    const file = await this.transfer.export(dataset as ExportDataset, query.format ?? 'csv', query.from, query.to, user);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  }

  @Post('imports/:kind')
  @HttpCode(200)
  @RequirePermissions('data.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Import clients (CSV/XLSX) or Altegio clients / visits / payments',
    description: 'Clients are matched by phone number (then email), so re-importing never creates duplicates. Use dryRun=true to preview.',
  })
  import(
    @Param('kind') kind: string,
    @Query() query: ImportQueryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportResultDto> {
    if (!IMPORT_KINDS.includes(kind as ImportKind)) throw new DomainError('NOT_FOUND', { message: 'Unknown import type.' });
    if (!file) throw new DomainError('IMPORT_INVALID_FILE', { message: 'Attach a CSV or XLSX file.' });
    if (!/\.(csv|xlsx)$/i.test(file.originalname)) throw new DomainError('FILE_TYPE_NOT_ALLOWED');
    return this.transfer.import(kind as ImportKind, file, query.dryRun ?? false, user);
  }

  @Get('imports')
  @RequirePermissions('data.import')
  jobs(): Promise<ImportJobDto[]> {
    return this.transfer.jobs();
  }
}
