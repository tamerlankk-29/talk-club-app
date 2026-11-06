import { Module } from '@nestjs/common';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramController],
  providers: [TelegramBotClient, TelegramService],
  exports: [TelegramService, TelegramBotClient],
})
export class TelegramModule {}
