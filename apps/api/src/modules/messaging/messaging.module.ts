import { Global, Module } from '@nestjs/common';
import { ChannelRegistry } from './channel-registry';
import { MessageOutbox } from './message-outbox';

@Global()
@Module({
  providers: [ChannelRegistry, MessageOutbox],
  exports: [ChannelRegistry, MessageOutbox],
})
export class MessagingModule {}
