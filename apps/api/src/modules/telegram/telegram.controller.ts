import { Body, Controller, Headers, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../../common/auth/decorators';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { TelegramService, TelegramUpdate } from './telegram.service';

/** Telegram Bot API webhook. Telegram proves itself with the secret token set in setWebhook. */
@ApiExcludeController()
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegram: TelegramService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') token: string | undefined, @Body() update: TelegramUpdate): Promise<{ ok: true }> {
    const secret = this.config.telegram.webhookSecret;
    if (!secret || !this.telegram.isAvailable()) throw new DomainError('NOT_FOUND');
    const expected = Buffer.from(secret);
    const actual = Buffer.from(token ?? '');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new DomainError('FORBIDDEN');
    try {
      await this.telegram.handleUpdate(update);
    } catch (error) {
      // Acknowledge anyway: Telegram would otherwise retry the same update indefinitely.
      this.logger.error(`Telegram update ${update?.update_id} failed: ${(error as Error).message}`);
    }
    return { ok: true };
  }
}
