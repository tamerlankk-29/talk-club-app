import type { NotificationChannel } from '@prisma/client';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A rendered message addressed to one person on one channel. */
export interface OutboundMessage {
  to: {
    userId?: string | null;
    phone?: string | null;
    email?: string | null;
    telegramChatId?: string | null;
    push?: PushTarget[];
  };
  title: string;
  body: string;
  url?: string | null;
  imageUrl?: string | null;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface ChannelSendResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string;
  providerMessageId?: string;
  error?: string;
  /** Push endpoints that the push service reported as gone (to be deleted). */
  expiredEndpoints?: string[];
}

/**
 * Adapter contract for every delivery channel. Real providers (WhatsApp Business,
 * an SMS gateway, SMTP, Telegram bot, …) implement this and are selected with
 * NOTIFY_*_PROVIDER environment variables — the rest of the system never knows
 * which provider is used.
 */
export interface ChannelProvider {
  readonly channel: NotificationChannel;
  readonly name: string;
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<ChannelSendResult>;
}
