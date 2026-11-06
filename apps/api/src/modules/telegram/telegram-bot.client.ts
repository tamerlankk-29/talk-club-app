import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

export interface TelegramReplyMarkup {
  keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  remove_keyboard?: boolean;
}

/**
 * Thin wrapper over the Telegram Bot API. The token never leaves this class;
 * tests replace it with a fake that records messages.
 */
@Injectable()
export class TelegramBotClient {
  private readonly logger = new Logger(TelegramBotClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return !!(this.config.telegram.botToken && this.config.telegram.botUsername);
  }

  /** t.me deep link that opens the bot; `start` is passed to /start as a payload. */
  botUrl(start?: string): string | null {
    const username = this.config.telegram.botUsername;
    if (!username) return null;
    return `https://t.me/${username}${start ? `?start=${encodeURIComponent(start)}` : ''}`;
  }

  async sendMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message'] });
  }

  private async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const token = this.config.telegram.botToken;
    if (!token) throw new Error('Telegram bot is not configured');
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; description?: string; result?: unknown } | null;
    if (!res.ok || !payload?.ok) {
      const reason = payload?.description ?? `HTTP ${res.status}`;
      this.logger.warn(`Telegram ${method} failed: ${reason}`);
      throw new Error(`Telegram ${method} failed: ${reason}`);
    }
    return payload.result;
  }
}
