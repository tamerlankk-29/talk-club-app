import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { normalizePhone } from '../../common/utils/phone';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramBotClient } from './telegram-bot.client';
import { BOT_TEXTS, botLanguage } from './telegram-texts';

/** The parts of a Telegram Update the bot uses. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; username?: string; language_code?: string; is_bot?: boolean };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

/**
 * Links Telegram chats to phone numbers. A link is created only when a user
 * shares their *own* contact with the bot (Telegram sets contact.user_id to the
 * sender), which proves they hold that number in Telegram.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBotClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Registers the webhook with Telegram when the bot is configured and the app is served over HTTPS. */
  async onApplicationBootstrap(): Promise<void> {
    const secret = this.config.telegram.webhookSecret;
    if (this.config.env === 'test' || !this.bot.isConfigured() || !secret || !this.config.appUrl.startsWith('https://')) return;
    try {
      await this.bot.setWebhook(`${this.config.appUrl}/api/telegram/webhook`, secret);
      this.logger.log('Telegram webhook registered');
    } catch (error) {
      this.logger.error(`Could not register the Telegram webhook: ${(error as Error).message}`);
    }
  }

  isAvailable(): boolean {
    return this.bot.isConfigured();
  }

  botUrl(): string | null {
    return this.bot.botUrl('login');
  }

  async chatIdForPhone(phone: string): Promise<string | null> {
    const link = await this.prisma.telegramLink.findUnique({ where: { phone } });
    return link?.chatId ?? null;
  }

  async sendCode(chatId: string, code: string): Promise<void> {
    const link = await this.prisma.telegramLink.findUnique({ where: { chatId } });
    await this.bot.sendMessage(chatId, BOT_TEXTS[botLanguage(link?.languageCode)].code(code));
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.from || message.from.is_bot || message.chat.type !== 'private') return;
    const chatId = String(message.chat.id);
    const texts = BOT_TEXTS[botLanguage(message.from.language_code)];
    const shareKeyboard = { keyboard: [[{ text: texts.shareButton, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };

    if (message.contact) {
      if (message.contact.user_id !== message.from.id) {
        await this.bot.sendMessage(chatId, texts.notOwnContact, shareKeyboard);
        return;
      }
      const digits = message.contact.phone_number.replace(/\D/g, '');
      const phone = normalizePhone(`+${digits}`);
      if (!phone) {
        await this.bot.sendMessage(chatId, texts.invalidPhone);
        return;
      }
      const telegramUserId = String(message.from.id);
      await this.prisma.$transaction([
        // One chat per phone and one phone per chat: the latest proof wins.
        this.prisma.telegramLink.deleteMany({ where: { OR: [{ phone }, { chatId }, { telegramUserId }] } }),
        this.prisma.telegramLink.create({
          data: { phone, chatId, telegramUserId, username: message.from.username ?? null, languageCode: message.from.language_code ?? null },
        }),
      ]);
      await this.bot.sendMessage(chatId, texts.linked, { remove_keyboard: true });
      return;
    }

    if (message.text?.startsWith('/start')) {
      await this.bot.sendMessage(chatId, texts.welcome, shareKeyboard);
      return;
    }
    await this.bot.sendMessage(chatId, texts.help, shareKeyboard);
  }
}
