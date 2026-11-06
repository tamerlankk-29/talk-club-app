import { Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import type { AppConfig } from '../../../config/app-config';
import type { ChannelProvider, ChannelSendResult, OutboundMessage } from '../channel.types';
import { MessageOutbox } from '../message-outbox';

/**
 * Web Push (VAPID) — works for the installed PWA on Android/desktop Chrome,
 * Edge, Firefox and iOS 16.4+ (when added to the Home Screen).
 */
export class WebPushProvider implements ChannelProvider {
  readonly channel = 'PUSH' as const;
  readonly name = 'webpush';
  private readonly logger = new Logger('Messaging:PUSH');
  private readonly configured: boolean;

  constructor(
    private readonly config: AppConfig,
    private readonly outbox: MessageOutbox,
  ) {
    this.configured = !!(config.push.publicKey && config.push.privateKey);
    if (this.configured) {
      webpush.setVapidDetails(config.push.subject, config.push.publicKey!, config.push.privateKey!);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(message: OutboundMessage): Promise<ChannelSendResult> {
    const targets = message.to.push ?? [];
    if (!targets.length) return { status: 'SKIPPED', provider: this.name, error: 'No push subscriptions' };
    if (!this.configured) {
      this.outbox.record({
        id: `push-${Date.now()}`,
        channel: 'PUSH',
        address: message.to.userId ?? 'unknown',
        title: message.title,
        body: message.body,
        at: new Date(),
      });
      return { status: 'SKIPPED', provider: this.name, error: 'VAPID keys not configured' };
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url ?? '/',
      image: message.imageUrl ?? undefined,
      tag: message.tag,
      data: message.data ?? {},
    });

    let delivered = 0;
    const expiredEndpoints: string[] = [];
    const errors: string[] = [];
    await Promise.all(
      targets.map(async (target) => {
        try {
          await webpush.sendNotification(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            payload,
            { TTL: 60 * 60 * 12, urgency: 'normal' },
          );
          delivered += 1;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) expiredEndpoints.push(target.endpoint);
          else errors.push(`${statusCode ?? ''} ${(error as Error).message}`.trim());
        }
      }),
    );
    if (errors.length) this.logger.warn(`Push delivery errors: ${errors.join('; ')}`);
    return delivered > 0
      ? { status: 'SENT', provider: this.name, expiredEndpoints }
      : { status: 'FAILED', provider: this.name, error: errors.join('; ') || 'Subscription expired', expiredEndpoints };
  }
}
