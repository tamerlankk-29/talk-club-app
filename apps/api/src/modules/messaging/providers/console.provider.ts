import { Logger } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { maskPhone } from '../../../common/utils/phone';
import type { ChannelProvider, ChannelSendResult, OutboundMessage } from '../channel.types';
import { MessageOutbox } from '../message-outbox';

/**
 * Development provider: writes the message to the log and to the in-memory
 * outbox (inspected by tests and the dev "sent messages" view) instead of
 * contacting an external service.
 */
export class ConsoleChannelProvider implements ChannelProvider {
  readonly name = 'console';
  private readonly logger: Logger;

  constructor(
    readonly channel: NotificationChannel,
    private readonly outbox: MessageOutbox,
    private readonly addressOf: (m: OutboundMessage) => string | null | undefined,
  ) {
    this.logger = new Logger(`Messaging:${channel}`);
  }

  isConfigured(): boolean {
    return true;
  }

  async send(message: OutboundMessage): Promise<ChannelSendResult> {
    const address = this.addressOf(message);
    if (!address) return { status: 'SKIPPED', provider: this.name, error: 'No address for this channel' };
    const id = randomUUID();
    this.outbox.record({ id, channel: this.channel, address, title: message.title, body: message.body, at: new Date() });
    const shown = this.channel === 'SMS' || this.channel === 'WHATSAPP' ? maskPhone(address) : address;
    this.logger.log(`→ ${shown}: ${message.title ? `${message.title} — ` : ''}${message.body}`);
    return { status: 'SENT', provider: this.name, providerMessageId: id };
  }
}
