import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { PURPOSES, UploadedFileDto, UploadQueryDto } from './dto/files.dto';
import { LocalDiskStorage, sniffMime, StorageProvider } from './storage';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  private readonly storage: StorageProvider;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.storage = new LocalDiskStorage(config.storage.localDir);
  }

  @Post()
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload an image or PDF (max 5 MB). purpose: avatar | teacher | marketing | document' })
  async upload(
    @Query() query: UploadQueryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<UploadedFileDto> {
    const purpose = query.purpose ?? 'avatar';
    const rule = PURPOSES[purpose];
    if (rule.permissions && !rule.permissions.some((p) => user.permissions.has(p))) throw new DomainError('FORBIDDEN');
    if (!file) throw new DomainError('VALIDATION_FAILED', { message: 'Attach a file.' });
    const sniffed = sniffMime(file.buffer);
    if (!sniffed || !(rule.types as readonly string[]).includes(sniffed.mime)) throw new DomainError('FILE_TYPE_NOT_ALLOWED');
    const now = new Date();
    const key = `${purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${sniffed.ext}`;
    await this.storage.put(key, file.buffer, sniffed.mime);
    const asset = await this.prisma.fileAsset.create({
      data: {
        storageKey: key,
        originalName: file.originalname?.slice(0, 200) ?? null,
        mimeType: sniffed.mime,
        size: file.size,
        purpose,
        uploadedById: user.id,
      },
    });
    return { id: asset.id, url: `/api/files/${asset.id}`, mimeType: asset.mimeType, size: asset.size };
  }

  @Public()
  @SkipThrottle()
  @Get(':id')
  @ApiOperation({ summary: 'Download a file (ids are unguessable UUIDs)' })
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) throw notFound('File');
    const body = await this.storage.get(asset.storageKey);
    if (!body) throw notFound('File');
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (asset.mimeType === 'application/pdf') res.setHeader('Content-Disposition', 'inline');
    res.send(body);
  }
}
