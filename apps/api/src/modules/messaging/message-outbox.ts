import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';

export interface OutboxRecord {
  id: string;
  channel: NotificationChannel;
  address: string;
  title: string;
  body: string;
  at: Date;
}

/** Ring buffer of messages "sent" by development providers (useful for tests and demos). */
@Injectable()
export class MessageOutbox {
  private readonly records: OutboxRecord[] = [];
  private readonly limit = 500;

  record(entry: OutboxRecord): void {
    this.records.push(entry);
    if (this.records.length > this.limit) this.records.shift();
  }

  list(filter?: { channel?: NotificationChannel; address?: string }): OutboxRecord[] {
    return this.records.filter(
      (r) => (!filter?.channel || r.channel === filter.channel) && (!filter?.address || r.address === filter.address),
    );
  }

  last(filter?: { channel?: NotificationChannel; address?: string }): OutboxRecord | undefined {
    const list = this.list(filter);
    return list[list.length - 1];
  }

  clear(): void {
    this.records.length = 0;
  }
}
