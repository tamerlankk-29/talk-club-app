import type { ChannelProvider, ChannelSendResult, OutboundMessage } from '../channel.types';
import type { TelegramBotClient } from '../../telegram/telegram-bot.client';

/**
 * Sends notifications as messages from the Talk Club bot. The address is the
 * chat id saved when the member shared their phone number with the bot.
 */
export class TelegramBotChannelProvider implements ChannelProvider {
  readonly channel = 'TELEGRAM' as const;
  readonly name = 'telegram_bot';

  constructor(
    private readonly bot: TelegramBotClient,
    private readonly appUrl: string,
  ) {}

  isConfigured(): boolean {
    return this.bot.isConfigured();
  }

  async send(message: OutboundMessage): Promise<ChannelSendResult> {
    const chatId = message.to.telegramChatId;
    if (!chatId) return { status: 'SKIPPED', provider: this.name, error: 'Telegram is not linked' };
    if (!this.isConfigured()) return { status: 'SKIPPED', provider: this.name, error: 'Telegram bot is not configured' };
    const link = message.url ? (message.url.startsWith('/') ? `${this.appUrl}${message.url}` : message.url) : null;
    const text = [message.title, message.body, link].filter(Boolean).join('\n\n');
    await this.bot.sendMessage(chatId, text);
    return { status: 'SENT', provider: this.name };
  }
}
