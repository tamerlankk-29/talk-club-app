import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../common/auth/decorators';
import { PageMetaDto, pageArgs, pageMeta, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto, AuditLogDto, AuditLogPageDto } from './dto/audit-http.dto';

@ApiTags('Admin · Audit log')
@Controller('admin/audit-logs')
@RequirePermissions('audit.view')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Audit log of administrative actions (newest first)' })
  async list(@Query() query: AuditQueryDto): Promise<AuditLogPageDto> {
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType || undefined,
      entityId: query.entityId || undefined,
      actorId: query.actorId || undefined,
      action: query.action ? { startsWith: query.action } : undefined,
      createdAt:
        query.from || query.to
          ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
          : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((i) => ({
        id: i.id,
        actorId: i.actorId,
        actorLabel: i.actorLabel,
        action: i.action,
        entityType: i.entityType,
        entityId: i.entityId,
        oldValue: i.oldValue,
        newValue: i.newValue,
        reason: i.reason,
        ip: i.ip,
        createdAt: i.createdAt,
      })),
      meta: pageMeta(query, total),
    };
  }
}
