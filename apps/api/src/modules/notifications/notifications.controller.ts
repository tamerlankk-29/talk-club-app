import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationCategory } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { DomainError } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { templatePlaceholders } from '../../common/utils/template';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MessageOutbox } from '../messaging/message-outbox';
import { DEFAULT_TEMPLATES } from './default-templates';
import {
  DeliveryDto,
  DeliveryQueryDto,
  InboxDto,
  InboxQueryDto,
  NotificationTemplateDto,
  PreferencesDto,
  PushPublicKeyDto,
  PushSubscriptionDto,
  PushUnsubscribeDto,
  UnreadCountDto,
  UpdatePreferencesDto,
  UpdateNotificationTemplateDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification inbox of the signed-in user (clients and staff)' })
  async inbox(@CurrentUser() user: AuthUser, @Query() query: InboxQueryDto): Promise<InboxDto> {
    return this.notifications.inbox(user.id, {
      limit: query.limit,
      before: query.before,
      unreadOnly: query.unreadOnly,
      category: query.category as NotificationCategory | 'CLIENT' | undefined,
    });
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser, @Query() query: InboxQueryDto): Promise<UnreadCountDto> {
    return { unreadCount: await this.notifications.unreadCount(user.id, query.category as NotificationCategory | 'CLIENT' | undefined) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<OkResponseDto> {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser, @Query() query: InboxQueryDto): Promise<UnreadCountDto> {
    await this.notifications.markAllRead(user.id, query.category as NotificationCategory | 'CLIENT' | undefined);
    return { unreadCount: 0 };
  }

  @Public()
  @Get('push/public-key')
  @ApiOperation({ summary: 'VAPID public key for PushManager.subscribe()' })
  publicKey(): PushPublicKeyDto {
    return { publicKey: this.notifications.publicKey() };
  }

  @Post('push/subscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register this device for push notifications' })
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscriptionDto, @Req() req: Request): Promise<OkResponseDto> {
    await this.notifications.subscribe(user.id, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
    });
    return { ok: true };
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto): Promise<OkResponseDto> {
    await this.notifications.unsubscribe(user.id, dto.endpoint);
    return { ok: true };
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser): Promise<PreferencesDto> {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Channel, reminder and marketing preferences (transactional messages stay in the inbox)' })
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto): Promise<PreferencesDto> {
    return this.notifications.updatePreferences(user.id, dto);
  }
}

@ApiTags('Admin · Notifications')
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly outbox: MessageOutbox,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('templates')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'All message templates (editable wording, buttons and channels)' })
  async templates(): Promise<NotificationTemplateDto[]> {
    const rows = await this.prisma.notificationTemplate.findMany();
    const stored = new Map(rows.map((r) => [r.key, r]));
    return DEFAULT_TEMPLATES.map((def) => {
      const row = stored.get(def.key);
      const t = row ?? { ...def, id: null, isActive: true, buttonLabel: def.buttonLabel ?? null, buttonUrl: def.buttonUrl ?? null };
      return {
        id: row?.id ?? null,
        key: def.key,
        name: def.name,
        description: def.description,
        category: def.category,
        title: t.title,
        body: t.body,
        buttonLabel: t.buttonLabel ?? null,
        buttonUrl: t.buttonUrl ?? null,
        secondaryButtonLabel: (row?.secondaryButtonLabel ?? def.secondaryButtonLabel) ?? null,
        secondaryButtonUrl: (row?.secondaryButtonUrl ?? def.secondaryButtonUrl) ?? null,
        channels: t.channels,
        isActive: row?.isActive ?? true,
        placeholders: [...new Set([...templatePlaceholders(def.title), ...templatePlaceholders(def.body), ...templatePlaceholders(def.buttonUrl ?? '')])],
        isCustomized: !!row && (row.title !== def.title || row.body !== def.body || row.channels.join() !== def.channels.join() || !row.isActive),
      };
    });
  }

  @Patch('templates/:key')
  @RequirePermissions('notifications.manage')
  async updateTemplate(@Param('key') key: string, @Body() dto: UpdateNotificationTemplateDto, @CurrentUser() user: AuthUser): Promise<NotificationTemplateDto[]> {
    const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
    if (!def) throw new DomainError('NOT_FOUND', { message: 'Unknown template.' });
    const before = await this.prisma.notificationTemplate.findUnique({ where: { key } });
    const base = {
      key,
      name: def.name,
      description: def.description,
      category: def.category,
      title: def.title,
      body: def.body,
      buttonLabel: def.buttonLabel ?? null,
      buttonUrl: def.buttonUrl ?? null,
      secondaryButtonLabel: def.secondaryButtonLabel ?? null,
      secondaryButtonUrl: def.secondaryButtonUrl ?? null,
      channels: def.channels,
    };
    await this.prisma.notificationTemplate.upsert({ where: { key }, create: { ...base, ...dto }, update: dto });
    await this.audit.log({ actor: user, action: 'template.update', entityType: 'NotificationTemplate', entityId: key, oldValue: before, newValue: dto });
    this.notifications.invalidateTemplates();
    return this.templates();
  }

  @Post('templates/:key/reset')
  @HttpCode(200)
  @RequirePermissions('notifications.manage')
  async resetTemplate(@Param('key') key: string, @CurrentUser() user: AuthUser): Promise<NotificationTemplateDto[]> {
    const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
    if (!def) throw new DomainError('NOT_FOUND', { message: 'Unknown template.' });
    await this.prisma.notificationTemplate.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, category: def.category, title: def.title, body: def.body, buttonLabel: def.buttonLabel, buttonUrl: def.buttonUrl, secondaryButtonLabel: def.secondaryButtonLabel, secondaryButtonUrl: def.secondaryButtonUrl, channels: def.channels },
      update: { title: def.title, body: def.body, buttonLabel: def.buttonLabel ?? null, buttonUrl: def.buttonUrl ?? null, secondaryButtonLabel: def.secondaryButtonLabel ?? null, secondaryButtonUrl: def.secondaryButtonUrl ?? null, channels: def.channels, isActive: true },
    });
    await this.audit.log({ actor: user, action: 'template.reset', entityType: 'NotificationTemplate', entityId: key });
    this.notifications.invalidateTemplates();
    return this.templates();
  }

  @Post('templates/:key/test')
  @HttpCode(200)
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Send this template to yourself with sample values' })
  async test(@Param('key') key: string, @CurrentUser() user: AuthUser): Promise<OkResponseDto> {
    const sample = {
      firstName: 'Tamerlan', clientName: 'Tamerlan Sample', teacherName: 'Michael', sessionTitle: 'Speaking Club',
      dateTime: 'Wed, 7 Oct, 18:30', time: '18:30', dayWord: 'tomorrow', date: '7 October 2026', hours: 2,
      visitsRemaining: 4, visitsNote: 'Visits left: 4.', planName: 'STANDARD', visits: 8, expiryDate: '24 October 2026',
      days: 3, daysText: 'in 3 days', amount: '26,000', description: 'STANDARD — 8 visits', expiresTime: '19:30',
      bookingId: 'sample', sessionId: 'sample', paymentId: 'sample', visitNote: 'Your visit was returned to your membership.',
      roomNote: ', Office 314', comment: 'Great participation today!', instructions: '', phone: '+7 701 000 00 00',
    };
    await this.notifications.notifyUser(user.id, { templateKey: key, vars: sample, category: 'TRANSACTIONAL', channels: ['IN_APP', 'PUSH'] });
    return { ok: true };
  }

  @Get('deliveries')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Delivery log per channel (push, SMS, WhatsApp, email, Telegram)' })
  async deliveries(@Query() query: DeliveryQueryDto): Promise<DeliveryDto[]> {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { status: query.status, channel: query.channel },
      include: { notification: { include: { user: { select: { displayName: true, phone: true } }, client: { select: { firstName: true, lastName: true, phone: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
    });
    return rows.map((d) => ({
      id: d.id,
      channel: d.channel,
      status: d.status,
      provider: d.provider,
      error: d.error,
      attempts: d.attempts,
      sentAt: d.sentAt,
      createdAt: d.createdAt,
      title: d.notification.title,
      recipient: d.notification.client
        ? fullName(d.notification.client.firstName, d.notification.client.lastName)
        : (d.notification.user?.displayName ?? null),
    }));
  }

  @Get('outbox')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Development: messages captured by the console providers (SMS codes, WhatsApp, email)' })
  devOutbox() {
    if (this.config.isProduction) throw new DomainError('NOT_FOUND');
    return this.outbox.list().slice(-100).reverse();
  }
}
