import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramController],
  // TelegramBotClient comes from the global MessagingModule (notifications use it too).
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
