import { Global, Module } from '@nestjs/common';
import { ChannelRegistry } from './channel-registry';
import { MessageOutbox } from './message-outbox';
import { TelegramBotClient } from '../telegram/telegram-bot.client';

@Global()
@Module({
  providers: [ChannelRegistry, MessageOutbox, TelegramBotClient],
  exports: [ChannelRegistry, MessageOutbox, TelegramBotClient],
})
export class MessagingModule {}
