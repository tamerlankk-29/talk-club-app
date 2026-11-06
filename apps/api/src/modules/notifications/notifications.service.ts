import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationCategory, NotificationChannel, NotificationTemplate, Prisma } from '@prisma/client';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { renderTemplate, TemplateVars } from '../../common/utils/template';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelRegistry } from '../messaging/channel-registry';
import { SettingsValue } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { TelegramBotClient } from '../telegram/telegram-bot.client';
import { DEFAULT_TEMPLATES, DefaultTemplate } from './default-templates';

export type StaffAlertKey = keyof SettingsValue<'notifications'>['adminAlerts'];

export interface NotificationPrefs {
  channels: { push: boolean; email: boolean; sms: boolean; whatsapp: boolean; telegram: boolean };
  /** Session and membership reminders */
  reminders: boolean;
}

export type PreferencesState = NotificationPrefs & {
  marketing: boolean;
  pushSubscriptions: number;
  /** The account phone is linked to the Telegram bot */
  telegramLinked: boolean;
  /** Link that opens the bot to connect Telegram (null when the bot is not set up) */
  telegramBotUrl: string | null;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  channels: { push: true, email: true, sms: true, whatsapp: true, telegram: true },
  reminders: true,
};

export interface NotifyContent {
  title: string;
  body: string;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
  secondaryButtonLabel?: string | null;
  secondaryButtonUrl?: string | null;
  imageUrl?: string | null;
}

export interface NotifyOptions {
  templateKey?: string;
  vars?: TemplateVars;
  /** Custom content (broadcasts, custom automation messages) instead of a template */
  content?: NotifyContent;
  category?: NotificationCategory;
  channels?: NotificationChannel[];
  data?: Record<string, unknown>;
  broadcastId?: string;
}

type RenderedTemplate = Required<Pick<NotifyContent, 'title' | 'body'>> & NotifyContent & {
  category: NotificationCategory;
  channels: NotificationChannel[];
  templateKey: string | null;
};

/**
 * Notification engine: renders templates, resolves recipients (a child's
 * notifications go to their guardians), applies preferences and consent, stores
 * the in-app inbox entry and queues one delivery per external channel.
 * Deliveries are sent by `dispatchPending()` right away and retried by a job.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private templateCache: { at: number; map: Map<string, NotificationTemplate> } | null = null;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelRegistry,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
    private readonly telegramBot: TelegramBotClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Templates ───

  private async templates(): Promise<Map<string, NotificationTemplate>> {
    if (this.templateCache && Date.now() - this.templateCache.at < 30_000) return this.templateCache.map;
    const rows = await this.prisma.notificationTemplate.findMany();
    this.templateCache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r])) };
    return this.templateCache.map;
  }

  invalidateTemplates(): void {
    this.templateCache = null;
  }

  async render(opts: NotifyOptions): Promise<RenderedTemplate | null> {
    const vars = opts.vars ?? {};
    if (opts.content) {
      return {
        templateKey: opts.templateKey ?? null,
        category: opts.category ?? 'TRANSACTIONAL',
        channels: opts.channels ?? ['IN_APP', 'PUSH', 'TELEGRAM'],
        title: renderTemplate(opts.content.title, vars),
        body: renderTemplate(opts.content.body, vars),
        buttonLabel: opts.content.buttonLabel ?? null,
        buttonUrl: opts.content.buttonUrl ? renderTemplate(opts.content.buttonUrl, vars) : null,
        secondaryButtonLabel: opts.content.secondaryButtonLabel ?? null,
        secondaryButtonUrl: opts.content.secondaryButtonUrl ? renderTemplate(opts.content.secondaryButtonUrl, vars) : null,
        imageUrl: opts.content.imageUrl ?? null,
      };
    }
    if (!opts.templateKey) return null;
    const stored = (await this.templates()).get(opts.templateKey);
    const fallback = DEFAULT_TEMPLATES.find((t) => t.key === opts.templateKey);
    const template: (DefaultTemplate & { isActive?: boolean }) | NotificationTemplate | undefined = stored ?? fallback;
    if (!template) {
      this.logger.warn(`Unknown notification template ${opts.templateKey}`);
      return null;
    }
    if ('isActive' in template && template.isActive === false) return null;
    return {
      templateKey: opts.templateKey,
      category: opts.category ?? template.category,
      channels: opts.channels ?? template.channels,
      title: renderTemplate(template.title, vars),
      body: renderTemplate(template.body, vars).replace(/\s+\n/g, '\n').trim(),
      buttonLabel: template.buttonLabel ? renderTemplate(template.buttonLabel, vars) : null,
      buttonUrl: template.buttonUrl ? renderTemplate(template.buttonUrl, vars) : null,
      secondaryButtonLabel: template.secondaryButtonLabel ? renderTemplate(template.secondaryButtonLabel, vars) : null,
      secondaryButtonUrl: template.secondaryButtonUrl ? renderTemplate(template.secondaryButtonUrl, vars) : null,
      imageUrl: null,
    };
  }

  // ─── Sending ───

  /** Notifies a client (or their guardians). Returns created notification ids. */
  async notifyClient(clientId: string, opts: NotifyOptions): Promise<string[]> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        user: { select: { id: true, email: true, phone: true, status: true, notificationPrefs: true } },
        guardians: { include: { guardian: { select: { id: true, email: true, phone: true, status: true, notificationPrefs: true } } } },
      },
    });
    if (!client || client.status === 'ANONYMIZED') return [];
    const rendered = await this.render({ ...opts, vars: { firstName: client.firstName, clientName: fullName(client.firstName, client.lastName), ...opts.vars } });
    if (!rendered) return [];
    if (rendered.category === 'MARKETING' && !client.marketingConsent) return [];

    const recipients: Array<{ userId: string | null; email: string | null; phone: string | null; prefs: NotificationPrefs; prefix: string }> = [];
    if (client.user && client.user.status === 'ACTIVE') {
      recipients.push({
        userId: client.user.id,
        email: client.user.email ?? client.email,
        phone: client.user.phone ?? client.phone,
        prefs: this.prefs(client.user.notificationPrefs),
        prefix: '',
      });
    }
    for (const g of client.guardians) {
      if (g.guardian.status !== 'ACTIVE' || g.guardian.id === client.user?.id) continue;
      recipients.push({
        userId: g.guardian.id,
        email: g.guardian.email,
        phone: g.guardian.phone,
        prefs: this.prefs(g.guardian.notificationPrefs),
        prefix: `${client.firstName}: `,
      });
    }
    if (!recipients.length && client.phone) {
      recipients.push({ userId: null, email: client.email, phone: client.phone, prefs: DEFAULT_PREFS, prefix: '' });
    }

    const ids: string[] = [];
    for (const r of recipients) {
      const id = await this.create(
        { ...rendered, title: r.prefix + rendered.title },
        { userId: r.userId, clientId, email: r.email, phone: r.phone, prefs: r.prefs },
        opts,
      );
      if (id) ids.push(id);
    }
    this.kick();
    return ids;
  }

  /** Notifies a user directly (staff alerts, test messages). */
  async notifyUser(userId: string, opts: NotifyOptions): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') return null;
    const rendered = await this.render(opts);
    if (!rendered) return null;
    const id = await this.create(rendered, { userId, clientId: null, email: user.email, phone: user.phone, prefs: this.prefs(user.notificationPrefs) }, opts);
    this.kick();
    return id;
  }

  /** In-app alert for every active staff member holding `permission`. */
  async notifyStaff(alert: StaffAlertKey, templateKey: string, vars: TemplateVars, permission: string): Promise<void> {
    const cfg = await this.settings.get('notifications');
    if (!cfg.adminAlerts[alert]) return;
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } },
      },
      select: { id: true },
    });
    const rendered = await this.render({ templateKey, vars, category: 'STAFF', channels: ['IN_APP'] });
    if (!rendered) return;
    if (users.length) {
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          category: 'STAFF' as const,
          templateKey,
          title: rendered.title,
          body: rendered.body,
          buttonLabel: rendered.buttonLabel ?? null,
          buttonUrl: rendered.buttonUrl ?? null,
          data: (vars ?? {}) as Prisma.InputJsonValue,
        })),
      });
    }
  }

  private async create(
    rendered: RenderedTemplate,
    to: { userId: string | null; clientId: string | null; email: string | null; phone: string | null; prefs: NotificationPrefs },
    opts: NotifyOptions,
  ): Promise<string | null> {
    const wanted = new Set(rendered.channels);
    const external: NotificationChannel[] = [];
    const hasPush = to.userId ? (await this.prisma.pushSubscription.count({ where: { userId: to.userId } })) > 0 : false;
    const remindersOff = rendered.category === 'REMINDER' && !to.prefs.reminders;
    const hasTelegram =
      wanted.has('TELEGRAM') && to.prefs.channels.telegram && !!to.phone
        ? (await this.prisma.telegramLink.count({ where: { phone: to.phone } })) > 0
        : false;

    if (!remindersOff) {
      if (wanted.has('PUSH') && to.prefs.channels.push && hasPush) external.push('PUSH');
      if (wanted.has('EMAIL') && to.prefs.channels.email && to.email) external.push('EMAIL');
      if (wanted.has('WHATSAPP') && to.prefs.channels.whatsapp && to.phone) external.push('WHATSAPP');
      if (hasTelegram) external.push('TELEGRAM');
      // SMS costs money: it is only a fallback when push or Telegram already reach the person.
      const reachedForFree = (wanted.has('PUSH') && hasPush) || hasTelegram;
      const smsAllowed = wanted.has('SMS') && to.prefs.channels.sms && to.phone && !reachedForFree;
      if (smsAllowed) external.push('SMS');
    }
    const inApp = !!to.userId && (wanted.has('IN_APP') || external.length > 0 || remindersOff);
    if (!inApp && !external.length) return null;

    const notification = await this.prisma.notification.create({
      data: {
        userId: inApp ? to.userId : null,
        clientId: to.clientId,
        category: rendered.category,
        templateKey: rendered.templateKey,
        title: rendered.title,
        body: rendered.body,
        imageUrl: rendered.imageUrl ?? null,
        buttonLabel: rendered.buttonLabel ?? null,
        buttonUrl: rendered.buttonUrl ?? null,
        secondaryButtonLabel: rendered.secondaryButtonLabel ?? null,
        secondaryButtonUrl: rendered.secondaryButtonUrl ?? null,
        data: (opts.data ?? undefined) as Prisma.InputJsonValue | undefined,
        broadcastId: opts.broadcastId ?? null,
        deliveries: external.length ? { create: external.map((channel) => ({ channel })) } : undefined,
      },
    });
    return notification.id;
  }

  private prefs(raw: Prisma.JsonValue | null | undefined): NotificationPrefs {
    const value = (raw ?? {}) as Partial<NotificationPrefs>;
    return {
      channels: { ...DEFAULT_PREFS.channels, ...(value.channels ?? {}) },
      reminders: value.reminders ?? DEFAULT_PREFS.reminders,
    };
  }

  /** Starts dispatching queued deliveries (inline in tests for determinism). */
  private kick(): void {
    if (this.config.env === 'test') return;
    setImmediate(() => {
      this.dispatchPending().catch((error) => this.logger.error(`Dispatch failed: ${(error as Error).message}`));
    });
  }

  /** Sends queued deliveries through the channel providers (retries up to 3 times). */
  async dispatchPending(limit = 200): Promise<number> {
    if (this.dispatching) return 0;
    this.dispatching = true;
    try {
      const pending = await this.prisma.notificationDelivery.findMany({
        where: { status: 'PENDING', attempts: { lt: 3 } },
        include: {
          notification: {
            include: {
              user: { select: { id: true, email: true, phone: true, pushSubscriptions: true } },
              client: { select: { phone: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      for (const delivery of pending) {
        const n = delivery.notification;
        const provider = this.channels.get(delivery.channel);
        if (!provider) {
          await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'SKIPPED', error: 'No provider', attempts: { increment: 1 } } });
          continue;
        }
        const url = n.buttonUrl ?? null;
        const absolute = url && url.startsWith('/') ? `${this.config.appUrl}${url}` : url;
        const textChannel = delivery.channel === 'SMS' || delivery.channel === 'WHATSAPP' || delivery.channel === 'EMAIL';
        const phone = n.user?.phone ?? n.client?.phone ?? null;
        try {
          const telegramChatId =
            delivery.channel === 'TELEGRAM' && phone
              ? ((await this.prisma.telegramLink.findUnique({ where: { phone }, select: { chatId: true } }))?.chatId ?? null)
              : null;
          const result = await provider.send({
            to: {
              userId: n.userId,
              phone,
              email: n.user?.email ?? n.client?.email ?? null,
              telegramChatId,
              push: n.user?.pushSubscriptions.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })) ?? [],
            },
            title: n.title,
            body: textChannel && absolute ? `${n.body}\n${absolute}` : n.body,
            url: url ?? '/notifications',
            imageUrl: n.imageUrl,
            tag: n.templateKey ?? undefined,
            data: { notificationId: n.id },
          });
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: result.status,
              provider: result.provider,
              providerMessageId: result.providerMessageId ?? null,
              error: result.error ?? null,
              attempts: { increment: 1 },
              sentAt: result.status === 'SENT' ? this.clock.now() : null,
            },
          });
          if (result.expiredEndpoints?.length) {
            await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: result.expiredEndpoints } } });
          }
        } catch (error) {
          const attempts = delivery.attempts + 1;
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { attempts, status: attempts >= 3 ? 'FAILED' : 'PENDING', error: (error as Error).message.slice(0, 500) },
          });
        }
      }
      return pending.length;
    } finally {
      this.dispatching = false;
    }
  }

  // ─── Inbox ───

  async inbox(userId: string, opts: { limit?: number; before?: string; unreadOnly?: boolean; category?: NotificationCategory | 'CLIENT' }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      readAt: opts.unreadOnly ? null : undefined,
      createdAt: opts.before ? { lt: new Date(opts.before) } : undefined,
      category: opts.category === 'CLIENT' ? { not: 'STAFF' } : opts.category,
    };
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(opts.limit ?? 30, 100) }),
      this.unreadCount(userId, opts.category),
    ]);
    return { items, unreadCount: unread };
  }

  unreadCount(userId: string, category?: NotificationCategory | 'CLIENT'): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, category: category === 'CLIENT' ? { not: 'STAFF' } : category },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: this.clock.now() } });
    if (!result.count && !(await this.prisma.notification.findFirst({ where: { id, userId } }))) throw notFound('Notification');
  }

  async markAllRead(userId: string, category?: NotificationCategory | 'CLIENT'): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, category: category === 'CLIENT' ? { not: 'STAFF' } : category },
      data: { readAt: this.clock.now() },
    });
    return result.count;
  }

  // ─── Push subscriptions & preferences ───

  publicKey(): string | null {
    return this.config.push.publicKey;
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }): Promise<void> {
    if (!/^https:\/\//.test(sub.endpoint)) throw new DomainError('VALIDATION_FAILED', { message: 'Invalid push endpoint.' });
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent ?? null },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent ?? null, lastUsedAt: this.clock.now() },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async getPreferences(userId: string): Promise<PreferencesState> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { client: { select: { marketingConsent: true } }, _count: { select: { pushSubscriptions: true } } },
    });
    const telegramLinked = user.phone ? (await this.prisma.telegramLink.count({ where: { phone: user.phone } })) > 0 : false;
    return {
      ...this.prefs(user.notificationPrefs),
      marketing: user.client?.marketingConsent ?? false,
      pushSubscriptions: user._count.pushSubscriptions,
      telegramLinked,
      telegramBotUrl: this.telegramBot.botUrl('notify'),
    };
  }

  async updatePreferences(
    userId: string,
    patch: { channels?: Partial<NotificationPrefs['channels']>; reminders?: boolean; marketing?: boolean },
  ): Promise<PreferencesState> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { client: true } });
    const current = this.prefs(user.notificationPrefs);
    const next: NotificationPrefs = {
      channels: { ...current.channels, ...(patch.channels ?? {}) },
      reminders: patch.reminders ?? current.reminders,
    };
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: next as unknown as Prisma.InputJsonValue } });
    if (patch.marketing !== undefined && user.client && user.client.marketingConsent !== patch.marketing) {
      await this.prisma.client.update({
        where: { id: user.client.id },
        data: { marketingConsent: patch.marketing, marketingConsentAt: this.clock.now() },
      });
      await this.prisma.clientActivity.create({
        data: {
          clientId: user.client.id,
          type: 'consent.marketing',
          title: patch.marketing ? 'Subscribed to marketing messages' : 'Unsubscribed from marketing messages',
          actorId: userId,
        },
      });
    }
    return this.getPreferences(userId);
  }
}
