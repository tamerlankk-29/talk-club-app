import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import type { ChannelProvider } from './channel.types';
import { MessageOutbox } from './message-outbox';
import { ConsoleChannelProvider } from './providers/console.provider';
import { TelegramBotClient } from '../telegram/telegram-bot.client';
import { MobizonSmsProvider } from './providers/mobizon.provider';
import { TelegramBotChannelProvider } from './providers/telegram-bot.provider';
import { WebPushProvider } from './providers/web-push.provider';

/**
 * Resolves the provider for each channel from configuration. To connect a real
 * service, implement ChannelProvider and add a case to `create()` — for example
 * NOTIFY_WHATSAPP_PROVIDER=whatsapp_cloud. NOTIFY_TELEGRAM_PROVIDER=telegram_bot
 * sends through the Talk Club bot (the default once TELEGRAM_BOT_TOKEN is set).
 */
@Injectable()
export class ChannelRegistry {
  private readonly logger = new Logger(ChannelRegistry.name);
  private readonly providers = new Map<NotificationChannel, ChannelProvider>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: MessageOutbox,
    private readonly telegramBot: TelegramBotClient,
  ) {
    this.providers.set('PUSH', new WebPushProvider(config, outbox));
    this.providers.set('SMS', this.create('SMS', config.notify.sms));
    this.providers.set('EMAIL', this.create('EMAIL', config.notify.email));
    this.providers.set('WHATSAPP', this.create('WHATSAPP', config.notify.whatsapp));
    this.providers.set('TELEGRAM', this.create('TELEGRAM', config.notify.telegram));
  }

  get(channel: NotificationChannel): ChannelProvider | undefined {
    return this.providers.get(channel);
  }

  describe(): Array<{ channel: NotificationChannel; provider: string; configured: boolean }> {
    return [...this.providers.values()].map((p) => ({ channel: p.channel, provider: p.name, configured: p.isConfigured() }));
  }

  private create(channel: NotificationChannel, providerName: string): ChannelProvider {
    switch (providerName) {
      case 'mobizon':
        if (channel === 'SMS') return new MobizonSmsProvider(this.config.sms);
        this.logger.warn(`Provider mobizon only works for SMS, ${channel} falls back to console`);
        return new ConsoleChannelProvider(channel, this.outbox, (m) => addressFor(channel, m.to));
      case 'telegram_bot':
        if (channel === 'TELEGRAM') return new TelegramBotChannelProvider(this.telegramBot, this.config.appUrl);
        this.logger.warn(`Provider telegram_bot only works for TELEGRAM, ${channel} falls back to console`);
        return new ConsoleChannelProvider(channel, this.outbox, (m) => addressFor(channel, m.to));
      case 'console':
      case 'mock':
        return new ConsoleChannelProvider(channel, this.outbox, (m) => addressFor(channel, m.to));
      default:
        this.logger.warn(`Unknown ${channel} provider "${providerName}", falling back to console`);
        return new ConsoleChannelProvider(channel, this.outbox, (m) => addressFor(channel, m.to));
    }
  }
}

function addressFor(
  channel: NotificationChannel,
  to: { phone?: string | null; email?: string | null; telegramChatId?: string | null },
): string | null | undefined {
  switch (channel) {
    case 'SMS':
    case 'WHATSAPP':
      return to.phone;
    case 'EMAIL':
      return to.email;
    case 'TELEGRAM':
      return to.telegramChatId;
    default:
      return null;
  }
}
